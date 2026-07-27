import AVFoundation
import AppKit
import Foundation

let inputPath = "/Users/fabricespahn/Downloads/text-animation-test.mp4"
let outputDir = "/private/tmp/text-animation-frames"

let fileManager = FileManager.default
try? fileManager.createDirectory(atPath: outputDir, withIntermediateDirectories: true)

let asset = AVURLAsset(url: URL(fileURLWithPath: inputPath))
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true

let times = [
  CMTime(seconds: 0.0, preferredTimescale: 600),
  CMTime(seconds: 0.15, preferredTimescale: 600),
  CMTime(seconds: 0.30, preferredTimescale: 600),
  CMTime(seconds: 0.45, preferredTimescale: 600),
  CMTime(seconds: 0.60, preferredTimescale: 600),
]

for (index, time) in times.enumerated() {
  let image = try generator.copyCGImage(at: time, actualTime: nil)
  let bitmap = NSBitmapImageRep(cgImage: image)
  let data = bitmap.representation(using: .png, properties: [:])!
  let outputPath = "\(outputDir)/frame-\(String(format: "%02d", index)).png"
  try data.write(to: URL(fileURLWithPath: outputPath))
  print(outputPath)
}
