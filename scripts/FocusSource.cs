using System;
using System.Windows.Forms;
class FocusSource {
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool LockSetForegroundWindow(uint code);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [STAThread] static void Main(string[] args) {
        if (args.Length > 0) { Console.WriteLine(GetForegroundWindow().ToInt64()); return; }
        var form = new Form { Text = "Translite focus regression source", Width = 650, Height = 400 };
        var input = new TextBox { Dock = DockStyle.Fill, Text = "Focus regression selected text", Multiline = true };
        form.Controls.Add(input);
        form.Shown += async (s, e) => {
            await System.Threading.Tasks.Task.Delay(300);
            ShowWindow(form.Handle, 5);
            keybd_event(0x12, 0, 0, UIntPtr.Zero);
            keybd_event(0x12, 0, 2, UIntPtr.Zero);
            SetForegroundWindow(form.Handle);
            form.Activate(); input.Focus(); input.SelectAll();
            await System.Threading.Tasks.Task.Delay(100);
            // Reproduce a foreground app refusing activation by a background process.
            if (!LockSetForegroundWindow(1)) throw new Exception("Unable to establish foreground lock");
            Console.WriteLine(form.Handle.ToInt64());
        };
        Application.Run(form);
    }
}
