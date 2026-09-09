import AppKit
import ApplicationServices
import Foundation

private let modifierMask: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]

private func captureSelection() -> String? {
    guard AXIsProcessTrusted(),
          let sourceApplication = NSWorkspace.shared.frontmostApplication else { return nil }

    let deadline = Date().addingTimeInterval(1.5)
    while !CGEventSource.flagsState(.combinedSessionState).intersection(modifierMask).isEmpty {
        if Date() >= deadline || NSWorkspace.shared.frontmostApplication?.processIdentifier != sourceApplication.processIdentifier {
            return nil
        }
        Thread.sleep(forTimeInterval: 0.01)
    }

    let pasteboard = NSPasteboard.general
    let initialChangeCount = pasteboard.changeCount
    guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 8, keyDown: true),
          let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 8, keyDown: false) else { return nil }
    keyDown.flags = .maskCommand
    keyUp.flags = .maskCommand
    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)

    let copyDeadline = Date().addingTimeInterval(1.0)
    while Date() < copyDeadline {
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == sourceApplication.processIdentifier else { return nil }
        if pasteboard.changeCount != initialChangeCount,
           let text = pasteboard.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !text.isEmpty {
            return text
        }
        Thread.sleep(forTimeInterval: 0.015)
    }
    return nil
}

guard let text = captureSelection(), let data = text.data(using: .utf8) else {
    exit(2)
}
FileHandle.standardOutput.write(data.base64EncodedData())
