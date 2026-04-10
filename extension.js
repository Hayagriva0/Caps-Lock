import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class CapsLockIndicatorExtension extends Extension {
    enable() {
        const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            this.dir.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );
        const schemaObj = schemaSource.lookup('org.gnome.shell.extensions.capslock-indicator', true);
        if (!schemaObj)
            throw new Error('Schema org.gnome.shell.extensions.capslock-indicator not found');
        this._settings = new Gio.Settings({ settings_schema: schemaObj });
        this._interfaceSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' });
        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._capsLockState = this._keymap.get_caps_lock_state();
        this._activePopup = null;
        this._dismissTimeoutId = null;
        this._expandTimeoutId = null;

        this._keymapSignalId = this._keymap.connect('state-changed', () => {
            this._onCapsLockChanged();
        });
    }

    disable() {
        if (this._keymapSignalId) {
            this._keymap.disconnect(this._keymapSignalId);
            this._keymapSignalId = null;
        }
        if (this._dismissTimeoutId) {
            GLib.Source.remove(this._dismissTimeoutId);
            this._dismissTimeoutId = null;
        }
        if (this._expandTimeoutId) {
            GLib.Source.remove(this._expandTimeoutId);
            this._expandTimeoutId = null;
        }
        if (this._activePopup) {
            this._activePopup.destroy();
            this._activePopup = null;
        }
        this._settings = null;
        this._interfaceSettings = null;
        this._keymap = null;
    }

    _onCapsLockChanged() {
        const newState = this._keymap.get_caps_lock_state();
        if (newState === this._capsLockState) {
            return;
        }
        this._capsLockState = newState;
        this._showIndicator();
    }

    _showIndicator() {
        // Destroy any existing popup immediately
        if (this._activePopup) {
            this._activePopup.destroy();
            this._activePopup = null;
        }

        // Cancel any pending dismiss timer
        if (this._dismissTimeoutId) {
            GLib.Source.remove(this._dismissTimeoutId);
            this._dismissTimeoutId = null;
        }

        if (this._expandTimeoutId) {
            GLib.Source.remove(this._expandTimeoutId);
            this._expandTimeoutId = null;
        }

        const style = this._settings.get_string('popup-style');

        if (style === 'dynamic-island') {
            this._showDynamicIslandPopup();
        } else if (style === 'deepin') {
            this._showDeepinPopup();
        } else {
            // Fallback: unknown values default to macOS style
            this._showMacOSPopup();
        }

        if (style !== 'dynamic-island') {
            // Schedule auto-dismiss after 2 seconds.
            // Note: `style` is captured by closure at popup creation time. If the user
            // changes popup-style during the 2s hold, dismiss uses the original style.
            // This is intentional — re-reading settings in the closure would mismatch
            // the popup widget that was already created with the original style.
            this._dismissTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                this._dismissActivePopup(style);
                this._dismissTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _dismissActivePopup(style) {
        if (!this._activePopup) return;

        const popup = this._activePopup;
        this._activePopup = null;

        if (style === 'deepin') {
            popup.ease({
                opacity: 0,
                scale_x: 0.9,
                scale_y: 0.9,
                duration: 160,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => popup.destroy(),
            });
        } else {
            popup.ease({
                opacity: 0,
                scale_x: 0.7,
                scale_y: 0.7,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => popup.destroy(),
            });
        }
    }

    _isDarkMode() {
        return this._interfaceSettings.get_string('color-scheme') === 'prefer-dark';
    }

    _showMacOSPopup() {
        const isDark = this._isDarkMode();
        const themeClass = isDark ? 'capslock-macos-dark' : 'capslock-macos-light';

        const popup = new St.Bin({
            style_class: `capslock-macos ${themeClass}`,
            opacity: 0,
            scale_x: 0.7,
            scale_y: 0.7,
        });

        const iconFileStr = this._capsLockState ? 'macos-caps-on.svg' : 'macos-caps-off.svg';
        const gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.dir.get_path() + '/icons/' + iconFileStr) });
        
        const icon = new St.Icon({
            gicon: gicon,
            style_class: 'capslock-macos-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        popup.set_child(icon);
        Main.uiGroup.add_child(popup);

        const monitor = Main.layoutManager.primaryMonitor;
        popup.x = Math.floor(monitor.x + (monitor.width / 2) - 28); // 28 = half of 56px circle width
        popup.y = Math.floor(monitor.y + Main.panel.height + 24); // 24px gap below top panel

        popup.set_pivot_point(0.5, 0.5);

        popup.ease({
            opacity: 255,
            scale_x: 1.0,
            scale_y: 1.0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });

        this._activePopup = popup;
    }

    _showDeepinPopup() {
        const isDark = this._isDarkMode();
        const themeClass = isDark ? 'capslock-deepin-dark' : 'capslock-deepin-light';

        const popup = new St.BoxLayout({
            style_class: `capslock-deepin ${themeClass}`,
            opacity: 0,
            scale_x: 0.85,
            scale_y: 0.85,
            vertical: true, // Stack icon and text vertically
        });

        const iconPrefix = this._capsLockState ? 'deepin-on' : 'deepin-off';
        const iconTheme = isDark ? 'dark' : 'light';
        const iconFileStr = `${iconPrefix}-${iconTheme}.svg`;
        const gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.dir.get_path() + '/icons/' + iconFileStr) });
        
        const icon = new St.Icon({
            gicon: gicon,
            style_class: 'capslock-deepin-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const label = new St.Label({
            text: this._capsLockState ? 'Caps Lock On' : 'Caps Lock Off',
            style_class: 'capslock-deepin-label',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        popup.add_child(icon);
        popup.add_child(label);
        Main.uiGroup.add_child(popup);

        const monitor = Main.layoutManager.primaryMonitor;

        // Use fixed dimensions from CSS for reliable centering
        const popupWidth = 144;
        const popupHeight = 144;
        popup.x = Math.floor(monitor.x + (monitor.width / 2) - (popupWidth / 2));
        popup.y = Math.floor(monitor.y + (monitor.height / 2) - (popupHeight / 2));

        popup.set_pivot_point(0.5, 0.5);

        popup.ease({
            opacity: 255,
            scale_x: 1.0,
            scale_y: 1.0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._activePopup = popup;
    }

    _showDynamicIslandPopup() {
        // We use a St.Widget or St.Bin with width/height set directly in Clutter.
        const popup = new St.Bin({
            style_class: 'capslock-dynamic-island',
            opacity: 0,
            scale_x: 0.6,
            scale_y: 0.6,
            clip_to_allocation: true,
            width: 120, // baseline pill width — Clutter needs a numeric start for width interpolation
            height: 34, // pill height
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Content
        const contentBox = new St.BoxLayout({
            style_class: 'capslock-dynamic-island-content',
            opacity: 0,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            x_expand: true,
        });

        const iconFileStr = this._capsLockState ? 'caps-lock-on-symbolic.svg' : 'caps-lock-off-symbolic.svg';
        const gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(this.dir.get_path() + '/icons/' + iconFileStr) });
        
        const icon = new St.Icon({
            gicon: gicon,
            style_class: 'capslock-dynamic-island-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });

        const label = new St.Label({
            text: this._capsLockState ? 'Caps Lock On' : 'Caps Lock Off',
            style_class: 'capslock-dynamic-island-label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        contentBox.add_child(icon);
        contentBox.add_child(label);
        popup.set_child(contentBox);

        Main.uiGroup.add_child(popup);

        const monitor = Main.layoutManager.primaryMonitor;
        popup.x = Math.floor(monitor.x + (monitor.width / 2) - 60); // 60 = half of 120px pill width
        popup.y = Math.floor(monitor.y + Main.panel.height + 8); // 8px gap below top panel

        popup.set_pivot_point(0.5, 0.5);

        this._activePopup = popup;

        // Phase 1 — Appear (collapsed pill)
        popup.ease({
            opacity: 255,
            scale_x: 1.0,
            scale_y: 1.0,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
            onComplete: () => {
                if (this._activePopup !== popup) return;

                // Phase 2 — Expand (morphs to show content)
                const targetWidth = 220; // expanded pill width showing icon + label
                popup.ease({
                    width: targetWidth,
                    x: Math.floor(monitor.x + (monitor.width / 2) - (targetWidth / 2)),
                    duration: 220,
                    mode: Clutter.AnimationMode.EASE_OUT_QUINT,
                    onComplete: () => {
                        if (this._activePopup !== popup) return;

                        // Add glow via CSS class
                        popup.add_style_class_name('capslock-dynamic-island-glow');

                        // Phase 3 — Hold
                        this._dismissTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1800, () => {
                            if (this._activePopup !== popup) return GLib.SOURCE_REMOVE;

                            this._dismissTimeoutId = null;

                            // Phase 4 — Dismiss (collapse + fade)
                            
                            // Content fades out first
                            contentBox.ease({
                                opacity: 0,
                                duration: 100,
                                mode: Clutter.AnimationMode.LINEAR
                            });

                            popup.remove_style_class_name('capslock-dynamic-island-glow');

                            // Dismiss parent
                            popup.ease({
                                width: 120, // collapse back to pill width
                                x: Math.floor(monitor.x + (monitor.width / 2) - 60), // re-center for 120px
                                opacity: 0,
                                duration: 180,
                                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                                onComplete: () => {
                                    if (this._activePopup === popup) {
                                        this._activePopup = null;
                                        popup.destroy();
                                    } else {
                                        popup.destroy();
                                    }
                                }
                            });

                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });

                // Content fades in during expansion, starting 60ms after expand begins
                this._expandTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                    this._expandTimeoutId = null;
                    if (this._activePopup !== popup) return GLib.SOURCE_REMOVE;
                    contentBox.ease({
                        opacity: 255,
                        duration: 120,
                        mode: Clutter.AnimationMode.LINEAR
                    });
                    return GLib.SOURCE_REMOVE;
                });
            }
        });
    }
}
