import AppKit
import Foundation

@MainActor
final class CompanionMenu: NSObject {
    func menu() -> NSMenu {
        let menu = NSMenu()
        for (title, action) in [("摸摸", "pet"), ("喂一口", "feed"), ("聊天与陪伴面板", "open-chat"), ("开始 25 分钟专注", "focus"), ("睡一会儿", "sleep"), ("叫醒", "wake")] {
            let item = NSMenuItem(title: title, action: #selector(selectAction(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = action
            menu.addItem(item)
        }
        return menu
    }

    @objc private func selectAction(_ sender: NSMenuItem) {
        guard let action = sender.representedObject as? String else { return }
        let event: [String: Any] = action == "open-chat"
            ? ["workbenchPet": true, "type": "open-chat"]
            : ["workbenchPet": true, "type": "pet-action", "action": action]
        guard let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        FileHandle.standardOutput.write(data + Data([10]))
    }
}
