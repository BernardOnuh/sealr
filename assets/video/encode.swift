// Encode a folder of JPEG frames into an H.264 MP4 with AVFoundation.
// usage: swift encode.swift FRAMES_DIR OUT.mp4 [FPS]
import AVFoundation
import AppKit

let args = CommandLine.arguments
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let fps = Int32(args.count > 3 ? args[3] : "30") ?? 30
let width = 1920, height = 1080

let files = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".jpg") }.sorted()
try? FileManager.default.removeItem(at: out)

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 10_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

for (i, name) in files.enumerated() {
    autoreleasepool {
        guard let image = NSImage(contentsOf: dir.appendingPathComponent(name)),
              let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
        guard let pb = buffer else { return }
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: Int64(i), timescale: fps))
    }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status == .completed {
    print("wrote \(out.path) (\(files.count) frames at \(fps) fps)")
} else {
    print("failed: \(String(describing: writer.error))")
    exit(1)
}
