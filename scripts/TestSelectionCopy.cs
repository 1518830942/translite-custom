using System;
using System.Diagnostics;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

class TestSelectionCopy
{
    static string helper;
    static async Task<string> Copy()
    {
        return await Task.Run(() => {
            var start = new ProcessStartInfo(helper) {
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
        var form = new Form { Text = "Translite selection copy verification", Width = 500, Height = 150 };
        var input = new TextBox { Dock = DockStyle.Fill, Multiline = true, Text = "Translite selection test 123" };
        form.Controls.Add(input);
        form.Shown += async (sender, e) => {
            var backup = Clipboard.GetDataObject();
            try {
                form.Activate();
                input.Focus();
                input.SelectAll();
                await Task.Delay(200);
                if (await Copy() != input.Text) throw new Exception("Selected text was not copied");
                if (await Copy() != input.Text) throw new Exception("Repeated selection was not copied");
                input.DeselectAll();
                if (await Copy() != null) throw new Exception("No selection reused stale clipboard text");
                Console.WriteLine("PASS: native Ctrl+C, repeated identical selection, no-selection stale clipboard guard");
                exit = 0;
            } catch (Exception error) { Console.Error.WriteLine(error.Message); }
            finally {
                if (backup != null) Clipboard.SetDataObject(backup, true);
                form.Close();
            }
        };
        Application.Run(form);
        return exit;
    }
}
