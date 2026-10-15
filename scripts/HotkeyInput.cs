using System;
using System.Runtime.InteropServices;
using System.Threading;

class HotkeyInput
{
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public ushort key, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public int x, y; public uint data, flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct Union { [FieldOffset(0)] public Keyboard keyboard; [FieldOffset(0)] public Mouse mouse; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint type; public Union value; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, Input[] inputs, int size);
    static Input Key(ushort key, bool up) { return new Input { type = 1, value = new Union { keyboard = new Keyboard { key = key, flags = up ? 2u : 0u } } }; }
    static void Send(params Input[] inputs) { if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input))) != inputs.Length) throw new Exception("SendInput failed"); }
    static int Main(string[] args)
    {
        try {
            if (args[0] == "escape") { Send(Key(0x1B, false), Key(0x1B, true)); return 0; }
            try {
                Send(Key(0x12, false));
                if (args.Length > 2) Thread.Sleep(Int32.Parse(args[2]));
                Send(Key(0x45, false));
                Thread.Sleep(Int32.Parse(args[0]));
            } finally {
                if (args.Length > 1 && args[1] == "alt-first") {
                    Send(Key(0x12, true));
                    Thread.Sleep(10);
                    Send(Key(0x45, true));
                } else { Send(Key(0x45, true), Key(0x12, true)); }
            }
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
}
