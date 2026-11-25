#if TEXTHUE_COUNT_WORK
import Foundation

package final class RendererWork {
    package var fits = 0
    package var cusps = 0
    package var hashes = 0

    package static var current: RendererWork {
        let storage = Thread.current.threadDictionary
        let key = "TextHue.RendererWork"
        if let counts = storage[key] as? RendererWork { return counts }
        let counts = RendererWork()
        storage[key] = counts
        return counts
    }
}
#endif
