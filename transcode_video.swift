import AVFoundation
import Foundation

let arguments = CommandLine.arguments

guard arguments.count == 3 else {
  fputs("Usage: transcode_video.swift <input> <output>\n", stderr)
  exit(1)
}

let inputURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])
let asset = AVURLAsset(url: inputURL)

guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
  fputs("Could not create export session.\n", stderr)
  exit(1)
}

try? FileManager.default.removeItem(at: outputURL)
exportSession.outputURL = outputURL
exportSession.outputFileType = .mp4
exportSession.shouldOptimizeForNetworkUse = true

let semaphore = DispatchSemaphore(value: 0)
exportSession.exportAsynchronously {
  semaphore.signal()
}
semaphore.wait()

switch exportSession.status {
case .completed:
  print("Export completed: \(outputURL.path)")
  exit(0)
case .failed:
  fputs("Export failed: \(exportSession.error?.localizedDescription ?? "unknown error")\n", stderr)
  exit(2)
case .cancelled:
  fputs("Export cancelled.\n", stderr)
  exit(3)
default:
  fputs("Export ended in unexpected state: \(exportSession.status.rawValue)\n", stderr)
  exit(4)
}
