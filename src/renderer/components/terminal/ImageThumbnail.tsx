interface ImageThumbnailProps {
  src: string
  onDismiss: () => void
}

export function ImageThumbnail({ src, onDismiss }: ImageThumbnailProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 140,
        height: 100,
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        background: '#09090b',
        animation: 'vbcdr-thumb-fade 220ms ease forwards',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          pointerEvents: 'none'
        }}
      />
      <button
        type="button"
        aria-label="Dismiss image preview"
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          padding: 0,
          borderRadius: 9,
          border: 'none',
          background: 'rgba(0,0,0,0.6)',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 12,
          lineHeight: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        ×
      </button>
    </div>
  )
}
