/** Hạt bụi ma thuật bay lên từ đáy màn hình (thuần CSS, vị trí tất định
 *  theo index để server/client render giống nhau). */
const COUNT = 16;

export default function MagicDust() {
  return (
    <div className="hex-dust" aria-hidden="true">
      {Array.from({ length: COUNT }, (_, i) => {
        const left = ((i * 61) % 97) + 1.5; // trải đều giả ngẫu nhiên
        const duration = 11 + ((i * 7) % 9); // 11s–19s
        const delay = -((i * 13) % 17); // âm để có hạt đang bay sẵn
        const scale = 0.6 + ((i * 3) % 5) * 0.22;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
              transform: `scale(${scale})`,
            }}
          />
        );
      })}
    </div>
  );
}
