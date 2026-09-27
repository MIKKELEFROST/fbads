// STUB — replaced by the scene author.
R.scene({
  id: 's3',
  render(ctx, lt, api) {
    const { P, W, H } = api;
    ctx.fillStyle = ['#1a1a22', '#FF4F1A', '#16161C', '#0B0B0E', '#3326FF', '#F2EDE4', '#0B0B0E'][3 - 1];
    ctx.fillRect(0, 0, W, H);
    R.font(ctx, { family: 'Unbounded', weight: 800, size: 160 });
    ctx.fillStyle = 3 === 6 ? P.ink : P.bone;
    ctx.fillText('S3', W / 2, H / 2 + 50);
    R.font(ctx, { family: 'JetBrains Mono', weight: 500, size: 28 });
    ctx.fillText(lt.toFixed(3) + 's', W / 2, H / 2 + 140);
    ctx.beginPath();
    ctx.arc(W / 2 + Math.sin(lt * 6) * 500, H / 2 - 200, 30, 0, Math.PI * 2);
    ctx.fill();
  },
});
