using System;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Runtime.InteropServices;

class HotkeySelectionSource
{
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [STAThread] static int Main(string[] args)
    {
        try {
            var form = new Form { Text = "Translite cross-process selection fixture", Width = 600, Height = 300 };
            var input = new TextBox { Multiline = true, Dock = DockStyle.Fill, Text = args[0] };
            var menu = new MenuStrip();
            menu.Items.Add(new ToolStripMenuItem("&File"));
            var edit = new ToolStripMenuItem("&Edit");
            edit.DropDownItems.Add(new ToolStripMenuItem("Copy fixture", null, (sender, e) => input.Copy()));
            menu.Items.Add(edit);
            form.MainMenuStrip = menu;
            form.Controls.Add(input);
            form.Controls.Add(menu);
            form.Activated += (s, e) => { input.Focus(); input.SelectAll(); };
            form.Shown += async (s, e) => {
                try {
                    await Task.Delay(100);
                    ShowWindow(form.Handle, 5);
                    input.Focus(); input.SelectAll();
                    Console.WriteLine(form.Handle.ToInt64());
                } catch (Exception error) { Console.Error.WriteLine(error.Message); form.Close(); }
            };
            Application.Run(form);
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
