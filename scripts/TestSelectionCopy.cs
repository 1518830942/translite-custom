using System;
using System.Diagnostics;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

class TestSelectionCopy
{
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    static string helper;
    static async Task<string> Copy(string arguments = "")
    {
        return await Task.Run(() => {
            var start = new ProcessStartInfo(helper, arguments) {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true
            };
            using (var process = Process.Start(start)) {
                string output = process.StandardOutput.ReadToEnd();
                process.WaitForExit();
                return process.ExitCode == 0 ? Encoding.UTF8.GetString(Convert.FromBase64String(output)) : null;
            }
        });
    }
    [STAThread]
    static int Main(string[] args)
    {
        helper = args[0];
        int exit = 1;
        var form = new Form { Text = "Translite selection copy verification", Width = 500, Height = 150, TopMost = true };
        var input = new TextBox { Dock = DockStyle.Fill, Multiline = true, Text = "Translite selection test 123" };
        form.Controls.Add(input);
        form.Shown += async (sender, e) => {
            try {
                await Task.Delay(300);
                ShowWindow(form.Handle, 5);
                await Copy("--activate " + form.Handle.ToInt64() + " " + Process.GetCurrentProcess().Id);
                form.Activate();
                input.Focus();
                input.SelectAll();
                await Task.Delay(200);
                if (GetForegroundWindow() != form.Handle) throw new Exception("Test window did not receive foreground focus");
                if (await Copy() != input.Text) throw new Exception("Selected text was not copied");
                if (await Copy() != input.Text) throw new Exception("Repeated selection was not copied");
                input.DeselectAll();
                var emptyTimer = Stopwatch.StartNew();
                if (await Copy() != null) throw new Exception("No selection reused stale clipboard text");
                Console.WriteLine("No-selection latency: " + emptyTimer.ElapsedMilliseconds + " ms");
                if (emptyTimer.ElapsedMilliseconds >= 700) throw new Exception("No selection still waits for the clipboard timeout");
                Console.WriteLine("PASS: selected text copied, repeated selection, fast empty-selection path");
                exit = 0;
            } catch (Exception error) { Console.Error.WriteLine(error.Message); }
            finally {
                form.Close();
            }
        };
        Application.Run(form);
        return exit;
    }
}
