// Mix narration, effects and music (ducked under the voice) onto the silent video.
// usage: swift finish.swift SILENT.mp4 MIX.json OUT.mp4
import AVFoundation

struct Clip: Decodable { let file: String; let start: Double; let volume: Float }
struct Music: Decodable { let file: String; let volume: Float; let duck_to: Float }
struct Mix: Decodable { let duration: Double; let voice: [Clip]; let sfx: [Clip]; let music: Music?; let voice_ranges: [[Double]] }

let args = CommandLine.arguments
let video = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let mix = try JSONDecoder().decode(Mix.self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let out = URL(fileURLWithPath: args[3])
try? FileManager.default.removeItem(at: out)

func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }
let comp = AVMutableComposition()
let length = video.duration
let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: video.tracks(withMediaType: .video)[0], at: .zero)

var params: [AVMutableAudioMixInputParameters] = []
func place(_ file: String, at start: Double, into track: AVMutableCompositionTrack) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: file))
    guard let src = asset.tracks(withMediaType: .audio).first else { return }
    let room = CMTimeSubtract(length, t(start))
    guard CMTimeCompare(room, .zero) > 0 else { return }
    try track.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(asset.duration, room)), of: src, at: t(start))
}

// All narration lines share one track: they never overlap.
let voiceTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
for clip in mix.voice { try place(clip.file, at: clip.start, into: voiceTrack) }

for fx in mix.sfx {
    let track = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try place(fx.file, at: fx.start, into: track)
    let p = AVMutableAudioMixInputParameters(track: track)
    p.setVolume(fx.volume, at: .zero)
    params.append(p)
}

if let music = mix.music {
    let track = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try place(music.file, at: 0, into: track)
    let p = AVMutableAudioMixInputParameters(track: track)
    // Duck the score while someone is speaking, swell it in the gaps, fade out at the end.
    // Merge lines separated by short pauses so the score does not pump between sentences.
    var spans: [(Double, Double)] = []
    for r in mix.voice_ranges {
        if let last = spans.last, r[0] - last.1 < 1.2 { spans[spans.count - 1].1 = r[1] } else { spans.append((r[0], r[1])) }
    }
    p.setVolume(music.volume, at: .zero)
    for (s, e) in spans {
        p.setVolumeRamp(fromStartVolume: music.volume, toEndVolume: music.duck_to, timeRange: CMTimeRange(start: t(max(0, s - 0.3)), duration: t(0.3)))
        p.setVolumeRamp(fromStartVolume: music.duck_to, toEndVolume: music.volume, timeRange: CMTimeRange(start: t(e + 0.1), duration: t(0.4)))
    }
    let end = CMTimeGetSeconds(length)
    p.setVolumeRamp(fromStartVolume: music.volume, toEndVolume: 0, timeRange: CMTimeRange(start: t(end - 2.0), duration: t(2.0)))
    params.append(p)
}

let audioMix = AVMutableAudioMix()
audioMix.inputParameters = params
let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = out
export.outputFileType = .mp4
export.audioMix = audioMix
let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()
if export.status == .completed { print("wrote \(out.path)") } else { print("failed: \(String(describing: export.error))"); exit(1) }
