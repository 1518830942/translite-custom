using System;
using System.Runtime.InteropServices;

// Native UI Automation COM interfaces, in Windows SDK vtable order. The unused
// declarations retain their slots and must not be called. Using native COM avoids
// the legacy .NET UIAutomation text-range bridge used by newer browser providers.
internal static class SelectionProbe
{
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

    public static bool? Read()
    {
        var automation = (Automation)Activator.CreateInstance(Type.GetTypeFromCLSID(
            new Guid("ff48dba4-60ef-4201-aa87-54103eef594e")));
        var element = automation.GetFocusedElement();
        var walker = automation.GetControlViewWalker();
        for (int depth = 0; element != null && depth < 8; depth++)
        {
            if (Equals(element.GetCurrentPropertyValue(30019), true)) return null; // IsPassword
            if (Equals(element.GetCurrentPropertyValue(30040), true)) // IsTextPatternAvailable
            {
                var pattern = (TextPattern)element.GetCurrentPattern(10014);
                if (pattern.GetSupportedTextSelection() != 0)
                {
                    var ranges = pattern.GetSelection();
                    if (ranges != null) for (int i = 0; i < ranges.GetLength(); i++)
                    {
                        var range = ranges.GetElement(i);
                        if (range.CompareEndpoints(0, range, 1) != 0) return true;
                    }
                    return false;
                }
            }
            element = walker.GetParentElement(element);
        }
        return null;
    }
}
