#!/usr/bin/env python3
"""Turn a video (or audio file) into things Claude can read: contact sheets of frames and a timed transcript.

    python3 -I watch.py <media> [--out DIR] [--lang ar|en|auto] [--every SECONDS] [--model small|base|medium]

Writes into DIR (default: ./watch-<name>):
  sheet-NN.jpg      grids of frames (8 per sheet, timestamps burned in) -> open them with the Read tool
  transcript.txt    speech as "[mm:ss] text" lines
  summary.json      duration, resolution, file list
Needs ffmpeg and `pip install sherpa-onnx`. The Whisper model is downloaded once from GitHub releases
(Hugging Face is often blocked in sandboxes) into ~/.cache/whisper-models.
"""
import argparse, json, os, subprocess, sys, tarfile, urllib.request, wave

MODELS = os.path.expanduser('~/.cache/whisper-models')
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-{m}.tar.bz2'


def run(*cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def probe(path):
    info = json.loads(run('ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path))
    video = next((s for s in info['streams'] if s['codec_type'] == 'video'), None)
    audio = any(s['codec_type'] == 'audio' for s in info['streams'])
    return float(info['format'].get('duration', 0)), video, audio


def sheets(path, out, every, duration):
    # Draw the timestamp on each frame, then tile 4x2 per sheet.
    vf = (f"fps=1/{every},scale=320:-2,"
          "drawtext=text='%{pts\\:gmtime\\:0\\:%M\\\\\\:%S}':x=6:y=6:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6,"
          "tile=4x2:padding=4:color=white")
    try:
        run('ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', vf, os.path.join(out, 'sheet-%02d.jpg'))
    except subprocess.CalledProcessError:  # ffmpeg without drawtext/fontconfig
        run('ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', f'fps=1/{every},scale=320:-2,tile=4x2:padding=4:color=white', os.path.join(out, 'sheet-%02d.jpg'))
    return sorted(f for f in os.listdir(out) if f.startswith('sheet-'))


def model_dir(size):
    d = os.path.join(MODELS, f'sherpa-onnx-whisper-{size}')
    if not os.path.isdir(d):
        os.makedirs(MODELS, exist_ok=True)
        tmp = d + '.tar.bz2'
        print(f'Downloading Whisper {size} model (one time)...', file=sys.stderr)
        urllib.request.urlretrieve(URL.format(m=size), tmp)
        with tarfile.open(tmp) as t:
            t.extractall(MODELS, filter='data')
        os.remove(tmp)
    return d


def transcribe(path, out, lang, size):
    import numpy as np
    import sherpa_onnx
    wav = os.path.join(out, 'audio.wav')
    run('ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav)
    d = model_dir(size)
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=os.path.join(d, f'{size}-encoder.int8.onnx'), decoder=os.path.join(d, f'{size}-decoder.int8.onnx'),
        tokens=os.path.join(d, f'{size}-tokens.txt'), language='' if lang == 'auto' else lang, task='transcribe',
        num_threads=os.cpu_count() or 2)
    with wave.open(wav) as w:
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    # Whisper takes up to 30 s per pass; use 25 s windows.
    step, lines = 16000 * 25, []
    for start in range(0, len(samples), step):
        s = rec.create_stream()
        s.accept_waveform(16000, samples[start:start + step])
        rec.decode_stream(s)
        text = s.result.text.strip()
        if text:
            t = start // 16000
            lines.append(f'[{t // 60:02d}:{t % 60:02d}] {text}')
    os.remove(wav)
    open(os.path.join(out, 'transcript.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    return lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('media')
    ap.add_argument('--out')
    ap.add_argument('--lang', default='auto')
    ap.add_argument('--every', type=float, default=0)
    ap.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium'])
    ap.add_argument('--no-audio', action='store_true')
    a = ap.parse_args()
    name = os.path.splitext(os.path.basename(a.media))[0]
    out = a.out or f'watch-{name}'
    os.makedirs(out, exist_ok=True)
    duration, video, audio = probe(a.media)
    # About 24 frames across the clip, at least one every 10 s for long videos.
    every = a.every or max(1.0, min(10.0, round(duration / 24, 1)))
    files = sheets(a.media, out, every, duration) if video else []
    lines = transcribe(a.media, out, a.lang, a.model) if audio and not a.no_audio else []
    summary = {'media': a.media, 'duration_s': round(duration, 1), 'resolution': f"{video['width']}x{video['height']}" if video else None,
               'frame_every_s': every if video else None, 'sheets': files, 'transcript_lines': len(lines), 'out': os.path.abspath(out)}
    json.dump(summary, open(os.path.join(out, 'summary.json'), 'w'), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
