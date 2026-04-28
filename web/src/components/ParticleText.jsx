import { useEffect, useRef } from 'react'

const WORDS = ['TRADING TOOLS', 'TRADE WITH NEWS', 'REAL-TIME DATA', 'GO PRO']

class Particle {
  constructor() {
    this.pos = { x: 0, y: 0 }
    this.vel = { x: 0, y: 0 }
    this.acc = { x: 0, y: 0 }
    this.target = { x: 0, y: 0 }
    this.closeEnoughTarget = 100
    this.maxSpeed = Math.random() * 6 + 4
    this.maxForce = this.maxSpeed * 0.05
    this.particleSize = 2
    this.isKilled = false
    this.startColor = { r: 0, g: 0, b: 0 }
    this.targetColor = { r: 0, g: 217, b: 146 } // accent green
    this.colorWeight = 0
    this.colorBlendRate = Math.random() * 0.03 + 0.005
  }

  move() {
    const distance = Math.hypot(this.pos.x - this.target.x, this.pos.y - this.target.y)
    const proximityMult = distance < this.closeEnoughTarget ? distance / this.closeEnoughTarget : 1

    const tx = this.target.x - this.pos.x
    const ty = this.target.y - this.pos.y
    const mag = Math.hypot(tx, ty) || 1
    const desired = { x: (tx / mag) * this.maxSpeed * proximityMult, y: (ty / mag) * this.maxSpeed * proximityMult }

    const sx = desired.x - this.vel.x
    const sy = desired.y - this.vel.y
    const sm = Math.hypot(sx, sy) || 1
    this.acc.x += (sx / sm) * this.maxForce
    this.acc.y += (sy / sm) * this.maxForce

    this.vel.x += this.acc.x
    this.vel.y += this.acc.y
    this.pos.x += this.vel.x
    this.pos.y += this.vel.y
    this.acc.x = 0
    this.acc.y = 0
  }

  draw(ctx) {
    if (this.colorWeight < 1.0) this.colorWeight = Math.min(this.colorWeight + this.colorBlendRate, 1.0)
    const r = Math.round(this.startColor.r + (this.targetColor.r - this.startColor.r) * this.colorWeight)
    const g = Math.round(this.startColor.g + (this.targetColor.g - this.startColor.g) * this.colorWeight)
    const b = Math.round(this.startColor.b + (this.targetColor.b - this.startColor.b) * this.colorWeight)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(this.pos.x, this.pos.y, 2, 2)
  }

  kill(w, h) {
    if (!this.isKilled) {
      const rx = Math.random() * w, ry = Math.random() * h
      const dx = rx - w / 2, dy = ry - h / 2
      const m = Math.hypot(dx, dy) || 1
      const mag = (w + h) / 2
      this.target = { x: w / 2 + (dx / m) * mag, y: h / 2 + (dy / m) * mag }
      this.startColor = {
        r: this.startColor.r + (this.targetColor.r - this.startColor.r) * this.colorWeight,
        g: this.startColor.g + (this.targetColor.g - this.startColor.g) * this.colorWeight,
        b: this.startColor.b + (this.targetColor.b - this.startColor.b) * this.colorWeight,
      }
      this.targetColor = { r: 0, g: 0, b: 0 }
      this.colorWeight = 0
      this.isKilled = true
    }
  }
}

function spawnWord(word, canvas, particlesRef) {
  const W = canvas.width, H = canvas.height
  const off = document.createElement('canvas')
  off.width = W; off.height = H
  const ctx = off.getContext('2d')

  // responsive font size
  const fontSize = W < 600 ? 48 : W < 900 ? 64 : 90
  ctx.fillStyle = 'white'
  ctx.font = `900 ${fontSize}px Inter, Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(word, W / 2, H / 2)

  const pixels = ctx.getImageData(0, 0, W, H).data
  const STEP = 5
  const coords = []
  for (let i = 0; i < pixels.length; i += STEP * 4) {
    if (pixels[i + 3] > 0) coords.push(i)
  }
  // shuffle
  for (let i = coords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [coords[i], coords[j]] = [coords[j], coords[i]]
  }

  const particles = particlesRef.current
  let idx = 0
  for (const ci of coords) {
    const x = (ci / 4) % W
    const y = Math.floor(ci / 4 / W)
    let p
    if (idx < particles.length) {
      p = particles[idx]
      p.isKilled = false
      idx++
    } else {
      p = new Particle()
      const rx = Math.random() * W, ry = Math.random() * H
      const dx = rx - W / 2, dy = ry - H / 2
      const m = Math.hypot(dx, dy) || 1
      const mag = (W + H) / 2
      p.pos = { x: W / 2 + (dx / m) * mag, y: H / 2 + (dy / m) * mag }
      particles.push(p)
    }
    p.startColor = {
      r: p.startColor.r + (p.targetColor.r - p.startColor.r) * p.colorWeight,
      g: p.startColor.g + (p.targetColor.g - p.startColor.g) * p.colorWeight,
      b: p.startColor.b + (p.targetColor.b - p.startColor.b) * p.colorWeight,
    }
    p.targetColor = { r: 0, g: 217, b: 146 }
    p.colorWeight = 0
    p.target = { x, y }
  }
  for (let i = idx; i < particles.length; i++) particles[i].kill(W, H)
}

export default function ParticleText() {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const frameRef = useRef(0)
  const wordIdxRef = useRef(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      spawnWord(WORDS[wordIdxRef.current], canvas, particlesRef)
    }
    resize()

    const animate = () => {
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const pts = particlesRef.current
      for (let i = pts.length - 1; i >= 0; i--) {
        pts[i].move()
        pts[i].draw(ctx)
        if (pts[i].isKilled && (pts[i].pos.x < 0 || pts[i].pos.x > canvas.width || pts[i].pos.y < 0 || pts[i].pos.y > canvas.height)) {
          pts.splice(i, 1)
        }
      }

      frameRef.current++
      if (frameRef.current % 220 === 0) {
        wordIdxRef.current = (wordIdxRef.current + 1) % WORDS.length
        spawnWord(WORDS[wordIdxRef.current], canvas, particlesRef)
      }

      rafRef.current = requestAnimationFrame(animate)
    }
    animate()

    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
