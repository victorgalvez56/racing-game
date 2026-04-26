// ArenaMinimap — fixed top-down view of the combat arena.
// Unlike Minimap (which follows the local car), this one shows the WHOLE
// arena at all times so players can read tactical positions: who's on the
// plateau, who's in the bowl, where the hazard zones are, etc.

const ARENA_SIZE = 100      // world meters across
const MAP_PX     = 196      // canvas size in CSS px
const MARGIN     = 6        // padding inside the canvas
const SCALE      = (MAP_PX - MARGIN * 2) / ARENA_SIZE

// Mirrors BODY_MATCAP in RemoteCar.js
const DOT_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#e67e22',
    '#9b59b6', '#1abc9c', '#e91e8c', '#ecf0f1',
]

// Hardcoded obstacle silhouettes — kept in sync with Arena.js layout.
// Drawn as filled rectangles; rotated rectangles approximated with axis-
// aligned for legibility on the small map.
const OBSTACLES = [
    // Center plateau (red, 14×14)
    { kind: 'rect', x:   0, y:   0, w: 14, h: 14, fill: 'rgba(255,46,77,0.55)' },

    // Skate bowl rim — render as outlined square with dark fill (NE)
    { kind: 'rect', x:  28, y:  28, w: 14, h: 14, fill: 'rgba(20,48,66,0.7)',  stroke: 'rgba(0,229,255,0.45)' },

    // Stairs deck — narrow strip + top deck (NW)
    { kind: 'rect', x: -28, y:  24, w:  6, h: 10, fill: 'rgba(180,180,200,0.45)' },
    { kind: 'rect', x: -28, y:  35, w:  8, h:  6, fill: 'rgba(255,46,77,0.55)' },

    // Big kicker ramp + landing (SE)
    { kind: 'rect', x:  28, y: -28, w:  7, h:  9, fill: 'rgba(255,46,77,0.55)' },

    // Spine ramps (SW)
    { kind: 'rect', x: -28, y: -28, w:  6, h: 10, fill: 'rgba(180,180,200,0.45)' },

    // L-cover walls in the south spawn corridor
    { kind: 'rect', x:  20, y: -32, w:  6, h:  1.5, fill: 'rgba(180,180,200,0.5)' },
    { kind: 'rect', x:  21, y: -29, w:  1.5, h: 4, fill: 'rgba(180,180,200,0.5)' },
    { kind: 'rect', x: -20, y: -32, w:  6, h:  1.5, fill: 'rgba(180,180,200,0.5)' },
    { kind: 'rect', x: -21, y: -29, w:  1.5, h: 4, fill: 'rgba(180,180,200,0.5)' },

    // Trees / pylons — small dots
    { kind: 'dot',  x:  18, y:   8, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x: -18, y:   8, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:  18, y:  -8, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x: -18, y:  -8, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:   8, y:  18, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:  -8, y:  18, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:   8, y: -18, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:  -8, y: -18, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:  40, y:  10, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x: -40, y: -10, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x:  10, y:  40, fill: '#7a7a8a', size: 2 },
    { kind: 'dot',  x: -10, y: -40, fill: '#7a7a8a', size: 2 },
]

export default class ArenaMinimap
{
    constructor(_options)
    {
        this.physics          = _options.physics
        this.remoteCarManager = _options.remoteCarManager || null
        this.localCarColor    = _options.localCarColor ?? 0
        this.pickups          = _options.pickups || []   // [{x, y, type}]
        this.hazards          = _options.hazards || []   // [{x, y, radius, type}]

        this._t = 0
        this._buildCanvas()
    }

    _buildCanvas()
    {
        this.$canvas = document.getElementById('mp-minimap-canvas')
        this.$wrap   = document.getElementById('mp-minimap')
        if(!this.$canvas) return

        // Make the wrap square (no circle clip) for arena view
        if(this.$wrap)
        {
            this.$wrap.style.borderRadius = '8px'
            this.$wrap.style.background   = 'rgba(8,8,15,0.78)'
            this.$wrap.style.border       = '1px solid rgba(255,46,77,0.25)'
            this.$wrap.style.width        = `${MAP_PX}px`
            this.$wrap.style.height       = `${MAP_PX}px`
            this.$wrap.style.display      = 'block'
        }

        const dpr = window.devicePixelRatio || 1
        this.$canvas.width  = MAP_PX * dpr
        this.$canvas.height = MAP_PX * dpr
        this.$canvas.style.width  = `${MAP_PX}px`
        this.$canvas.style.height = `${MAP_PX}px`

        this.ctx = this.$canvas.getContext('2d')
        this.ctx.scale(dpr, dpr)
    }

    // World (X,Y) → canvas (x,y). World +Y is up; canvas +y is down → flip Y.
    _toCanvas(wx, wy)
    {
        return {
            x: MARGIN + (wx + ARENA_SIZE / 2) * SCALE,
            y: MARGIN + (ARENA_SIZE / 2 - wy) * SCALE,
        }
    }

    update(dt = 16)
    {
        if(!this.ctx || !this.physics) return
        this._t += dt
        const ctx = this.ctx

        ctx.clearRect(0, 0, MAP_PX, MAP_PX)

        // ── Background grid ────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(10,10,20,0.5)'
        ctx.fillRect(MARGIN, MARGIN, MAP_PX - MARGIN * 2, MAP_PX - MARGIN * 2)

        ctx.strokeStyle = 'rgba(255,46,77,0.10)'
        ctx.lineWidth = 0.5
        for(let i = -ARENA_SIZE / 2; i <= ARENA_SIZE / 2; i += 10)
        {
            const a = this._toCanvas(i, -ARENA_SIZE / 2)
            const b = this._toCanvas(i,  ARENA_SIZE / 2)
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
            const c = this._toCanvas(-ARENA_SIZE / 2, i)
            const d = this._toCanvas( ARENA_SIZE / 2, i)
            ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke()
        }

        // ── Hazard zones (drawn under obstacles so dots stay readable) ────
        for(const z of this.hazards)
        {
            const c = this._toCanvas(z.x, z.y)
            const r = z.radius * SCALE
            const isHeal = z.type === 'heal' || z.type === 'healing'

            const pulse = 0.55 + Math.sin(this._t * 0.005 + z.x * 0.1) * 0.25
            ctx.fillStyle = isHeal
                ? `rgba(0, 255, 102, ${0.18 * pulse})`
                : `rgba(255, 182, 39, ${0.22 * pulse})`
            ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill()

            ctx.strokeStyle = isHeal ? 'rgba(0, 255, 102, 0.7)' : 'rgba(255, 182, 39, 0.85)'
            ctx.lineWidth = 1.2
            ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke()
        }

        // ── Obstacle silhouettes ───────────────────────────────────────────
        for(const o of OBSTACLES)
        {
            if(o.kind === 'rect')
            {
                const c = this._toCanvas(o.x, o.y)
                const w = o.w * SCALE
                const h = o.h * SCALE
                ctx.fillStyle = o.fill
                ctx.fillRect(c.x - w / 2, c.y - h / 2, w, h)
                if(o.stroke)
                {
                    ctx.strokeStyle = o.stroke
                    ctx.lineWidth = 1
                    ctx.strokeRect(c.x - w / 2, c.y - h / 2, w, h)
                }
            }
            else if(o.kind === 'dot')
            {
                const c = this._toCanvas(o.x, o.y)
                ctx.fillStyle = o.fill
                ctx.beginPath(); ctx.arc(c.x, c.y, o.size, 0, Math.PI * 2); ctx.fill()
            }
        }

        // ── Pickups ────────────────────────────────────────────────────────
        const blink = 0.6 + Math.sin(this._t * 0.006) * 0.4
        for(const p of this.pickups)
        {
            const c = this._toCanvas(p.x, p.y)
            const isHealth = p.type === 'health'

            ctx.save()
            ctx.translate(c.x, c.y)
            ctx.fillStyle = isHealth ? `rgba(0, 255, 102, ${blink})` : `rgba(255, 153, 0, ${blink})`
            ctx.shadowColor = isHealth ? '#00ff66' : '#ff8800'
            ctx.shadowBlur = 4

            if(isHealth)
            {
                // Plus / cross icon
                ctx.fillRect(-3, -1, 6, 2)
                ctx.fillRect(-1, -3, 2, 6)
            }
            else
            {
                // Diamond (rotated square)
                ctx.beginPath()
                ctx.moveTo(0, -3)
                ctx.lineTo(3, 0)
                ctx.lineTo(0, 3)
                ctx.lineTo(-3, 0)
                ctx.closePath()
                ctx.fill()
            }
            ctx.restore()
        }

        // ── Remote players ─────────────────────────────────────────────────
        if(this.remoteCarManager)
        {
            for(const car of this.remoteCarManager.cars.values())
            {
                const pos = car.container.position
                const c = this._toCanvas(pos.x, pos.y)
                const color = DOT_COLORS[car.carColor % DOT_COLORS.length]
                this._drawDot(ctx, c.x, c.y, color, 4.5)

                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.font = '9px "JetBrains Mono", monospace'
                ctx.textAlign = 'center'
                ctx.fillText(car.name || '?', c.x, c.y - 8)
            }
        }

        // ── Local player (arrow) ───────────────────────────────────────────
        const body = this.physics.car.chassis.body
        const lp = this._toCanvas(body.position.x, body.position.y)
        const q   = body.quaternion
        const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
        const color = DOT_COLORS[this.localCarColor % DOT_COLORS.length]
        this._drawArrow(ctx, lp.x, lp.y, -yaw + Math.PI / 2, color, 6)

        // ── Border ─────────────────────────────────────────────────────────
        ctx.strokeStyle = 'rgba(255,46,77,0.4)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(MARGIN, MARGIN, MAP_PX - MARGIN * 2, MAP_PX - MARGIN * 2)
    }

    _drawDot(ctx, x, y, color, size = 5)
    {
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.lineWidth = 1
        ctx.fill()
        ctx.stroke()
    }

    _drawArrow(ctx, x, y, angle, color, size = 6)
    {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)

        ctx.beginPath()
        ctx.moveTo(0, -size * 1.4)
        ctx.lineTo( size * 0.8, size)
        ctx.lineTo(-size * 0.8, size)
        ctx.closePath()

        ctx.fillStyle = color
        ctx.strokeStyle = 'rgba(0,0,0,0.65)'
        ctx.lineWidth = 1.2
        ctx.fill()
        ctx.stroke()

        ctx.restore()
    }

    destroy()
    {
        if(this.$canvas)
            this.$canvas.getContext('2d').clearRect(0, 0, MAP_PX, MAP_PX)
    }
}
