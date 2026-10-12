import { useEffect, useRef } from "react";

export default function CanvasReactor() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const size = 700;

    canvas.width = size;
    canvas.height = size;

    const cx = size / 2;
    const cy = size / 2;

    let rotation = 0;
    let animationId;

    const particles = [];

    for (let i = 0; i < 900; i++) {
      particles.push({
        radius: 100 + Math.random() * 210,
        angle: Math.random() * Math.PI * 2,
        size: 0.6 + Math.random() * 1.8,
        speed:
          0.0005 +
          Math.random() * 0.0025,
      });
    }

    function drawParticles() {
      ctx.save();

      for (const p of particles) {
        p.angle += p.speed;

        const x =
          cx +
          Math.cos(p.angle) *
            p.radius;

        const y =
          cy +
          Math.sin(p.angle) *
            p.radius;

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          p.size,
          0,
          Math.PI * 2
        );

        ctx.fillStyle = "#ff9d00";

        ctx.shadowColor = "#ff9d00";
        ctx.shadowBlur = 8;

        ctx.fill();
      }

      ctx.restore();
    }

    function drawBrokenOrbit(rx, ry, rotationAngle) {
  ctx.save();

  ctx.translate(cx, cy);
  ctx.rotate(rotationAngle);

  const segments = [
    [0.2, 1.1],
    [1.7, 2.8],
    [3.3, 4.2],
    [4.8, 5.9]
  ];

  segments.forEach(([start, end]) => {
    ctx.beginPath();

    ctx.ellipse(
      0,
      0,
      rx,
      ry,
      0,
      start,
      end
    );

    ctx.strokeStyle =
      "rgba(255,170,0,0.9)";

    ctx.lineWidth = 3;

    ctx.shadowColor = "#ff9900";
    ctx.shadowBlur = 15;

    ctx.stroke();
  });

  ctx.restore();
}

    function drawCore() {
      ctx.save();

      const pulse =
        34 +
        Math.sin(rotation * 5) * 4;

      const gradient =
        ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          65
        );

      gradient.addColorStop(
        0,
        "#ffffff"
      );

      gradient.addColorStop(
        0.25,
        "#fff4a3"
      );

      gradient.addColorStop(
        0.65,
        "#ffb000"
      );

      gradient.addColorStop(
        1,
        "rgba(255,120,0,0)"
      );

      ctx.beginPath();

      ctx.arc(
        cx,
        cy,
        pulse,
        0,
        Math.PI * 2
      );

      ctx.fillStyle = gradient;

      ctx.shadowColor = "#ff9d00";
      ctx.shadowBlur = 70;

      ctx.fill();

      ctx.restore();
    }

    function drawSpikes() {
  ctx.save();

  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let i = 0; i < 8; i++) {
    const angle =
      (Math.PI * 2 * i) / 8;

    const len =
      160 +
      Math.random() * 80;

    ctx.beginPath();

    ctx.moveTo(
      Math.cos(angle) * 40,
      Math.sin(angle) * 40
    );

    ctx.lineTo(
      Math.cos(angle) * len,
      Math.sin(angle) * len
    );

    ctx.strokeStyle =
      "rgba(255,180,0,0.8)";

    ctx.lineWidth = 2;

    ctx.shadowColor = "#ff9900";
    ctx.shadowBlur = 10;

    ctx.stroke();
  }

  ctx.restore();
}

    function animate() {
      // CRITICAL:
      // Reset canvas transformation
      // before clearing every frame.
      ctx.setTransform(
        1,
        0,
        0,
        1,
        0,
        0
      );

      ctx.clearRect(
        0,
        0,
        size,
        size
      );

      rotation += 0.003;

      drawParticles();

      drawBrokenOrbit(
  170,
  110,
  rotation
);

drawBrokenOrbit(
  120,
  210,
  -rotation * 1.2
);

drawBrokenOrbit(
  230,
  90,
  rotation * 0.7
);

      // drawBeams();
      drawSpikes();
      drawCore();

      animationId =
        requestAnimationFrame(
          animate
        );
    }

    animate();

    return () => {
      cancelAnimationFrame(
        animationId
      );
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "700px",
        height: "700px",
        display: "block",
      }}
    />
  );
}