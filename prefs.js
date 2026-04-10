import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CapsLockIndicatorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            this.dir.get_child('schemas').get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );
        const schemaObj = schemaSource.lookup('org.gnome.shell.extensions.capslock-indicator', true);
        if (!schemaObj)
            throw new Error('Schema org.gnome.shell.extensions.capslock-indicator not found');
        const settings = new Gio.Settings({ settings_schema: schemaObj });

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Customize how the Caps Lock indicator looks',
        });

        page.add(group);

        const row = new Adw.ComboRow({
            title: 'Popup Style',
            subtitle: 'Choose the visual style for the Caps Lock indicator',
        });

        const model = new Gtk.StringList();
        model.append('macOS Style (Circle)');
        model.append('Deepin Style (Rectangle)');
        model.append('Dynamic Island');
        row.set_model(model);

        // Set current selection from settings
        const currentStyle = settings.get_string('popup-style');
        if (currentStyle === 'dynamic-island') {
            row.set_selected(2);
        } else if (currentStyle === 'deepin') {
            row.set_selected(1);
        } else {
            row.set_selected(0);
        }

        // Write back to settings on change
        row.connect('notify::selected', () => {
            const selected = row.get_selected();
            if (selected === 2) {
                settings.set_string('popup-style', 'dynamic-island');
            } else if (selected === 1) {
                settings.set_string('popup-style', 'deepin');
            } else {
                settings.set_string('popup-style', 'macos');
            }
        });

        group.add(row);
        window.add(page);
    }
}
