import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/**
 * iOS Share Extension entry point.
 *
 * Per SYNC.md spec (PC commit a190824): minimal native flow that copies the
 * shared file into the App Group container, then opens the host app via the
 * `app.linkher.mobile://save-to-vault?...` deep link. The host app's WebView
 * picks the URL up via Capacitor App.appUrlOpen and runs the upload through
 * the existing /save-to-vault.html code path — keeps a single upload code
 * path between web, Android, and iOS.
 *
 * Required Apple Developer portal config (operator):
 *   1. AppID for app.linkher.mobile.ShareExtension created
 *   2. App Group group.app.linkher.mobile enabled on BOTH AppIDs
 *      (host app + share extension)
 *   3. Provisioning profiles regenerated to include the App Group capability
 */

class ShareViewController: UIViewController {

    private let appGroupID = "group.app.linkher.mobile"
    private let hostAppScheme = "app.linkher.mobile"

    override func viewDidLoad() {
        super.viewDidLoad()

        guard let extensionContext = extensionContext,
              let inputItem = extensionContext.inputItems.first as? NSExtensionItem,
              let attachments = inputItem.attachments else {
            finishWithError("Nothing was shared.")
            return
        }

        // Type identifiers we know how to handle, in priority order.
        let typesToTry: [String] = [
            UTType.image.identifier,
            UTType.movie.identifier,
            UTType.audio.identifier,
            UTType.pdf.identifier,
            "public.file-url",
            UTType.plainText.identifier,
        ]

        handleFirstMatchingAttachment(attachments, typesToTry: typesToTry) { [weak self] tempURL, displayName, mime in
            guard let self = self else { return }
            guard let tempURL = tempURL else {
                self.finishWithError("Could not read the shared file.")
                return
            }

            // Copy into App Group container so the host app can read it back.
            guard let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupID) else {
                self.finishWithError("App Group not available.")
                return
            }
            let inboxDir = groupURL.appendingPathComponent("share-inbox", isDirectory: true)
            try? FileManager.default.createDirectory(at: inboxDir, withIntermediateDirectories: true)
            let safeName = (displayName as NSString).lastPathComponent
                .replacingOccurrences(of: "/", with: "_")
            let destName = "\(Int(Date().timeIntervalSince1970 * 1000))-\(safeName)"
            let destURL = inboxDir.appendingPathComponent(destName)
            do {
                if FileManager.default.fileExists(atPath: destURL.path) {
                    try FileManager.default.removeItem(at: destURL)
                }
                try FileManager.default.copyItem(at: tempURL, to: destURL)
            } catch {
                self.finishWithError("Could not copy file to vault inbox: \(error.localizedDescription)")
                return
            }

            // Build the deep-link URL back into the host app.
            var comps = URLComponents()
            comps.scheme = self.hostAppScheme
            comps.host = "save-to-vault"
            comps.queryItems = [
                URLQueryItem(name: "uri", value: destURL.path),
                URLQueryItem(name: "name", value: safeName),
                URLQueryItem(name: "mime", value: mime),
            ]
            if let url = comps.url {
                self.openHostApp(url: url)
            } else {
                self.finishWithError("Could not build the host app deep link.")
            }
        }
    }

    /**
     * Walk the attachment list, try each type identifier in priority order,
     * stop on the first one that successfully resolves to a file URL.
     */
    private func handleFirstMatchingAttachment(
        _ attachments: [NSItemProvider],
        typesToTry: [String],
        completion: @escaping (URL?, String, String) -> Void
    ) {
        func tryNextType(_ providers: [NSItemProvider], _ idx: Int) {
            if idx >= typesToTry.count {
                completion(nil, "shared-file", "application/octet-stream")
                return
            }
            let utt = typesToTry[idx]
            let match = providers.first(where: { $0.hasItemConformingToTypeIdentifier(utt) })
            guard let provider = match else {
                tryNextType(providers, idx + 1)
                return
            }
            provider.loadItem(forTypeIdentifier: utt, options: nil) { item, _ in
                DispatchQueue.main.async {
                    var url: URL?
                    if let u = item as? URL { url = u }
                    else if let data = item as? Data {
                        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(Int(Date().timeIntervalSince1970)).bin")
                        try? data.write(to: tmp)
                        url = tmp
                    } else if let str = item as? String {
                        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(Int(Date().timeIntervalSince1970)).txt")
                        try? str.write(to: tmp, atomically: true, encoding: .utf8)
                        url = tmp
                    }
                    let name = url?.lastPathComponent ?? "shared-file"
                    let mime = self.mimeForUTI(utt)
                    completion(url, name, mime)
                }
            }
        }
        tryNextType(attachments, 0)
    }

    private func mimeForUTI(_ uti: String) -> String {
        if let ut = UTType(uti), let m = ut.preferredMIMEType { return m }
        return "application/octet-stream"
    }

    /**
     * Apple-sanctioned trick to launch the host app from within an extension:
     * walk the responder chain looking for a parent that responds to
     * `openURL:`, then perform that selector. UIApplication.shared.open is
     * not available to extensions.
     */
    private func openHostApp(url: URL) {
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let r = responder {
            if r.responds(to: selector) {
                _ = r.perform(selector, with: url)
                break
            }
            responder = r.next
        }
        self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func finishWithError(_ message: String) {
        let alert = UIAlertController(title: "Couldn't save", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default, handler: { _ in
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }))
        present(alert, animated: true)
    }
}
