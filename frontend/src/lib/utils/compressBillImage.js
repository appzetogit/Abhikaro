/**
 * Resize and re-encode bill photos for faster upload on mobile networks.
 * Keeps long edge readable for receipts while shrinking payload vs full camera resolution.
 *
 * @param {File|Blob} file
 * @param {{ maxLongEdge?: number, quality?: number, skipIfUnderBytes?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function compressBillImageForUpload(file, opts = {}) {
  const maxLongEdge = opts.maxLongEdge ?? 1600
  const quality = opts.quality ?? 0.82
  const skipIfUnderBytes = opts.skipIfUnderBytes ?? 550 * 1024

  if (!file || !(file instanceof Blob)) {
    throw new Error('Invalid file')
  }

  if (
    file.type === 'image/jpeg' &&
    file.size <= skipIfUnderBytes
  ) {
    const name =
      file instanceof File && file.name
        ? file.name
        : `bill-${Date.now()}.jpg`
    return file instanceof File
      ? file
      : new File([file], name, { type: 'image/jpeg' })
  }

  let bitmapOrImage = null
  let objectUrl = null

  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmapOrImage = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        })
      } catch {
        bitmapOrImage = null
      }
    }

    if (!bitmapOrImage) {
      objectUrl = URL.createObjectURL(file)
      bitmapOrImage = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Image load failed'))
        image.src = objectUrl
      })
    }

    let width = bitmapOrImage.width
    let height = bitmapOrImage.height
    const longEdge = Math.max(width, height)

    if (longEdge > maxLongEdge) {
      const scale = maxLongEdge / longEdge
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas not supported')
    }
    ctx.drawImage(bitmapOrImage, 0, 0, width, height)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      )
    })

    const baseName =
      file instanceof File && file.name
        ? file.name.replace(/\.[^.]+$/, '') || 'bill'
        : 'bill'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
    if (bitmapOrImage && typeof bitmapOrImage.close === 'function') {
      bitmapOrImage.close()
    }
  }
}

/**
 * Base64 (raw or data URL) → Blob without per-byte JS loops (faster on large camera images).
 * Falls back to manual decode if data URL fetch is unavailable.
 *
 * @param {string} base64WithOrWithoutPrefix
 * @param {string} [mimeType]
 * @returns {Promise<Blob>}
 */
export async function base64ToBlobFast(base64WithOrWithoutPrefix, mimeType = 'image/jpeg') {
  let raw = base64WithOrWithoutPrefix
  let mime = mimeType

  if (raw.includes(',')) {
    const [header, ...rest] = raw.split(',')
    raw = rest.join(',')
    const m = header.match(/data:([^;]+)/)
    if (m) mime = m[1]
  }

  try {
    const res = await fetch(`data:${mime};base64,${raw}`)
    return await res.blob()
  } catch {
    const bin = atob(raw)
    const len = bin.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
  }
}
