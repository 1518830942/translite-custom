using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class SelectionCopy
{
    [StructLayout(LayoutKind.Sequential)]
    struct KeyboardInput { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)]
    struct MouseInput { public int x, y; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput keyboard;
        [FieldOffset(0)] public MouseInput mouse;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Input { public uint type; public InputUnion value; }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint count, Input[] inputs, int size);

    static Input Key(ushort key, bool up)
    {
        return new Input { type = 1, value = new InputUnion {
            keyboard = new KeyboardInput { key = key, flags = up ? 2u : 0u }
        }};
    }

    static bool ModifierHeld()
    {
        foreach (int key in new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C })
            if ((GetAsyncKeyState(key) & 0x8000) != 0) return true;
        return false;
    }

    public static string Capture()
    {
        IntPtr foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero) return null;
        var timer = Stopwatch.StartNew();
        // Alt/Ctrl/Shift must be released before synthesizing Ctrl+C.
        while (ModifierHeld())
        {
            if (timer.ElapsedMilliseconds > 1500 || GetForegroundWindow() != foreground) return null;
            Thread.Sleep(10);
        }
        if (GetForegroundWindow() != foreground) return null;
        uint sequence = GetClipboardSequenceNumber();
        var inputs = new[] { Key(0x11, false), Key(0x43, false), Key(0x43, true), Key(0x11, true) };
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))) != inputs.Length)
            return null;

        timer.Restart();
        while (timer.ElapsedMilliseconds < 1000)
        {
            if (GetForegroundWindow() != foreground) return null;
            try
            {
                // Reading also materializes delayed clipboard data. Never reuse stale text.
                uint beforeRead = GetClipboardSequenceNumber();
                string text = Clipboard.GetText(TextDataFormat.UnicodeText);
                uint afterRead = GetClipboardSequenceNumber();
                if (afterRead != sequence && beforeRead == afterRead &&
                    GetForegroundWindow() == foreground && !String.IsNullOrWhiteSpace(text))
                    return text;
            }
            catch (ExternalException) { /* The source application may still own the clipboard. */ }
            Thread.Sleep(15);
        }
        return null;
    }

    static int Activate(string handle, string process)
    {
        IntPtr target = new IntPtr(Int64.Parse(handle));
        uint owner;
        if (GetWindowThreadProcessId(target, out owner) == 0 || owner != UInt32.Parse(process)) return 4;
        if (GetForegroundWindow() == target) return 0;
        SetForegroundWindow(target);
        Thread.Sleep(30);
        if (GetForegroundWindow() == target) return 0;

        // Windows explicitly unlocks foreground switching on Alt. Only use this
        // fallback for a user-requested activation, after selection copying ends.
        // Do not mix synthesized input with keys the user is still holding.
        var timer = Stopwatch.StartNew();
        while (ModifierHeld())
        {
            if (timer.ElapsedMilliseconds > 500) return 5;
            Thread.Sleep(10);
        }
        var inputs = new[] { Key(0x12, false), Key(0x12, true) };
        if (SendInput(2, inputs, Marshal.SizeOf(typeof(Input))) != 2) return 5;
        Thread.Sleep(20);
        SetForegroundWindow(target);
        for (int i = 0; i < 10; i++)
        {
            if (GetForegroundWindow() == target) return 0;
            Thread.Sleep(20);
        }
        return 6;
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 3 && args[0] == "--activate") return Activate(args[1], args[2]);
            string text = Capture();
            if (text == null) return 2;
            Console.Write(Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
            return 0;
        }
        catch { return 3; }
    }
}
