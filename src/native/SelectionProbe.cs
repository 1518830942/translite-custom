using System;
using System.Runtime.InteropServices;

// Native UI Automation COM interfaces, in Windows SDK vtable order. The unused
// declarations retain their slots and must not be called. Using native COM avoids
// the legacy .NET UIAutomation text-range bridge used by newer browser providers.
internal static class SelectionProbe
{
    public enum State { Unknown, Empty, Selected, Menu }

    public sealed class Result
    {
        public readonly State State;
        public readonly Action RefocusDocument;
        public Result(State state, Action refocusDocument = null)
        {
            State = state;
            RefocusDocument = refocusDocument;
        }
    }

    [ComImport, Guid("30cbe57d-d9d0-452a-ab13-7ac5ac4825ee"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Automation
    {
        void CompareElements(); void CompareRuntimeIds(); void GetRootElement();
        void ElementFromHandle(); void ElementFromPoint();
        Element GetFocusedElement();
        void GetRootElementBuildCache(); void ElementFromHandleBuildCache();
        void ElementFromPointBuildCache(); void GetFocusedElementBuildCache(); void CreateTreeWalker();
        Walker GetControlViewWalker();
    }
    [ComImport, Guid("d22108aa-8ac5-49a5-837b-37bbb3d7591e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Element
    {
        void SetFocus(); void GetRuntimeId(); void FindFirst(); void FindAll();
        void FindFirstBuildCache(); void FindAllBuildCache(); void BuildUpdatedCache();
        [return: MarshalAs(UnmanagedType.Struct)] object GetCurrentPropertyValue(int property);
        void GetCurrentPropertyValueEx(); void GetCachedPropertyValue(); void GetCachedPropertyValueEx();
        void GetCurrentPatternAs(); void GetCachedPatternAs();
        [return: MarshalAs(UnmanagedType.IUnknown)] object GetCurrentPattern(int pattern);
    }
    [ComImport, Guid("4042c624-389c-4afc-a630-9df854a541fc"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Walker { Element GetParentElement(Element element); }
    [ComImport, Guid("32eba289-3583-42c9-9c59-3b6d9a1e9b6a"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface TextPattern
    {
        void RangeFromPoint(); void RangeFromChild();
        Ranges GetSelection();
        void GetVisibleRanges(); void GetDocumentRange();
        int GetSupportedTextSelection();
    }
    [ComImport, Guid("ce4ae76a-e717-4c98-81ea-47371d028eb6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Ranges { int GetLength(); Range GetElement(int index); }
    [ComImport, Guid("a543cc6a-f4ae-494b-8239-c814481187a8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface Range
    {
        void Clone(); void Compare();
        int CompareEndpoints(int start, Range range, int end);
    }

    public static Result Read()
    {
        var automation = (Automation)Activator.CreateInstance(Type.GetTypeFromCLSID(
            new Guid("ff48dba4-60ef-4201-aa87-54103eef594e")));
        var element = automation.GetFocusedElement();
        var walker = automation.GetControlViewWalker();
        bool supportsSelection = false;
        Element document = null;
        for (int depth = 0; element != null && depth < 32; depth++)
        {
            // Alt release can focus a menu instead of the selected document.
            // Chromium exposes its native menu bar as a Pane named by class.
            int controlType = Convert.ToInt32(element.GetCurrentPropertyValue(30003));
            if (controlType == 50030) document = element; // Document
            if (controlType == 50009 || controlType == 50010 || controlType == 50011 ||
                Equals(element.GetCurrentPropertyValue(30012), "MenuBar"))
                return new Result(State.Menu);
            if (Equals(element.GetCurrentPropertyValue(30019), true)) return new Result(State.Unknown); // IsPassword
            if (Equals(element.GetCurrentPropertyValue(30040), true)) // IsTextPatternAvailable
            {
                var pattern = (TextPattern)element.GetCurrentPattern(10014);
                if (pattern.GetSupportedTextSelection() != 0)
                {
                    supportsSelection = true;
                    var ranges = pattern.GetSelection();
                    if (ranges != null) for (int i = 0; i < ranges.GetLength(); i++)
                    {
                        var range = ranges.GetElement(i);
                        if (range.CompareEndpoints(0, range, 1) != 0) return new Result(State.Selected);
                    }
                    // An empty focused input does not rule out a selection in
                    // the containing document (for example a chat transcript).
                }
            }
            if (controlType == 50030 || controlType == 50032) break; // Document / Window
            element = walker.GetParentElement(element);
        }
        // Keep the timed probe read-only. The caller may refocus a document
        // after this worker completes, never from a late/timed-out worker.
        return new Result(supportsSelection ? State.Empty : State.Unknown,
            document == null ? null : (Action)document.SetFocus);
    }
}
