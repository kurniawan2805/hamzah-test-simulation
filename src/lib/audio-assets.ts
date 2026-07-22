export const AUDIO_BUCKET = import.meta.env.VITE_AUDIO_BUCKET || 'Audio1'

const audioPaths: Record<string, string> = {
  audio_perpustakaan_01: '1.mp3',
  audio_rutinitas_02: '2.mp3',
  audio_kesehatan_03: '3.mp3',
  audio_pameran_04: '4.mp3',
}

export function getAudioPath(sharedAssetId?: string): string | undefined {
  return sharedAssetId ? audioPaths[sharedAssetId] : undefined
}

export function getAudioPathForPosition(position: number): string | undefined {
  if (position >= 1 && position <= 3) return '1.mp3'
  if (position >= 4 && position <= 5) return '2.mp3'
  if (position >= 6 && position <= 8) return '3.mp3'
  if (position >= 9 && position <= 10) return '4.mp3'
  return undefined
}
