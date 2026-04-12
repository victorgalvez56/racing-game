// Minimap — top-left canvas showing all player positions
// Local player = white arrow (shows heading). Remote players = colored dots.

const MAP_PX    = 160    // canvas size in CSS/device pixels
const MAP_RANGE = 40     // world units visible from center in each direction
const SCALE     = MAP_PX / (MAP_RANGE * 2)

// Matches the BODY_MATCAP color indices in RemoteCar.js / Car.js
const DOT_COLORS = [
    '#e74c3c',  // 0 red
    '#3498db',  // 1 blue
    '#2ecc71',  // 2 green
    '#e67e22',  // 3 orange
    '#9b59b6',  // 4 purple
    '#1abc9c',  // 5 teal
    '#e91e8c',  // 6 pink
    '#ecf0f1',  // 7 white
]

export default class Minimap
{
    constructor(_options)
    {
        this.physics           = _options.physics           // physics.car.chassis.body
        this.remoteCarManager  = _options.remoteCarManager  // .cars Map
        this.network           = _options.network           // .localPlayerName, null if solo
        this.localCarColor     = _options.localCarColor ?? 0

        this._buildCanvas()
    }

    _buildCanvas()
    {
        this.$canvas = document.getElementById('mp-minimap-canvas')
        if(!this.$canvas)
        {
            console.warn('[Minimap] #mp-minimap-canvas not found in DOM')
            return
        }

        const dpr = window.devicePixelRatio || 1
        this.$canvas.width  = MAP_PX * dpr
        this.$canvas.height = MAP_PX * dpr
        this.$canvas.style.width  = `${MAP_PX}px`
        this.$canvas.style.height = `${MAP_PX}px`

        this.ctx = this.$canvas.getContext('2d')
        this.ctx.scale(dpr, dpr)
        this.dpr = dpr
    }

    // Convert world XY → canvas XY relative to the local car (centered)
    _toCanvas(wx, wy, cx, cy)
    {
        const dx = wx - cx
        const dy = wy - cy
        return {
            x: MAP_PX / 2 + dx * SCALE,
            y: MAP_PX / 2 - dy * SCALE,  // y flipped: world +y = canvas up
        }
    }

    _drawArrow(ctx, x, y, angle, color, size = 6)
    {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)

        ctx.beginPath()
        ctx.moveTo(0, -size * 1.4)       // tip
        ctx.lineTo( size * 0.7,  size)   // right base
        ctx.lineTo(-size * 0.7,  size)   // left base
        ctx.closePath()

        ctx.fillStyle   = color
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.lineWidth   = 1.2
        ctx.fill()
        ctx.stroke()

        ctx.restore()
    }

    _drawDot(ctx, x, y, color, size = 5)
    {
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle   = color
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth   = 1
        ctx.fill()
        ctx.stroke()
    }

    update()
    {
        if(!this.ctx || !this.physics) return

        const ctx = this.ctx
        const body = this.physics.car.chassis.body

        const cx = body.position.x
        const cy = body.position.y

        // ── background ──────────────────────────────────────────────────────
        ctx.clearRect(0, 0, MAP_PX, MAP_PX)

        // Clip to circle
        ctx.save()
        ctx.beginPath()
        ctx.arc(MAP_PX / 2, MAP_PX / 2, MAP_PX / 2 - 1, 0, Math.PI * 2)
        ctx.clip()

        // Dark fill
        ctx.fillStyle = 'rgba(10, 10, 10, 0.82)'
        ctx.fillRect(0, 0, MAP_PX, MAP_PX)

        // Subtle grid lines (every 10 world units)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'
        ctx.lineWidth   = 0.5
        const gridStep  = 10 * SCALE
        const offsetX   = (MAP_PX / 2) - (cx % 10) * SCALE
        const offsetY   = (MAP_PX / 2) + (cy % 10) * SCALE
        for(let gx = offsetX % gridStep; gx < MAP_PX; gx += gridStep)
        {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, MAP_PX); ctx.stroke()
        }
        for(let gy = offsetY % gridStep; gy < MAP_PX; gy += gridStep)
        {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(MAP_PX, gy); ctx.stroke()
        }

        // ── remote players ──────────────────────────────────────────────────
        if(this.remoteCarManager)
        {
            for(const car of this.remoteCarManager.cars.values())
            {
                const pos = car.container.position
                const p   = this._toCanvas(pos.x, pos.y, cx, cy)

                // Skip if outside the visible circle
                const dx = p.x - MAP_PX / 2
                const dy = p.y - MAP_PX / 2
                if(Math.sqrt(dx * dx + dy * dy) > MAP_PX / 2 - 4) continue

                const color = DOT_COLORS[car.carColor % DOT_COLORS.length]
                this._drawDot(ctx, p.x, p.y, color, 5)

                // Name tag
                ctx.fillStyle    = 'rgba(255,255,255,0.75)'
                ctx.font         = '9px monospace'
                ctx.textAlign    = 'center'
                ctx.fillText(car.name, p.x, p.y - 8)
            }
        }

        // ── local player (center, always) ───────────────────────────────────
        {
            // Extract heading angle from quaternion (rotation around Z axis)
            const q   = body.quaternion
            const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))

            const color = DOT_COLORS[this.localCarColor % DOT_COLORS.length]
            this._drawArrow(ctx, MAP_PX / 2, MAP_PX / 2, -yaw + Math.PI / 2, color, 7)
        }

        ctx.restore()

        // ── border ring ─────────────────────────────────────────────────────
        ctx.beginPath()
        ctx.arc(MAP_PX / 2, MAP_PX / 2, MAP_PX / 2 - 1, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth   = 1.5
        ctx.stroke()
    }

    destroy()
    {
        if(this.$canvas)
        {
            this.$canvas.getContext('2d').clearRect(0, 0, MAP_PX, MAP_PX)
        }
    }
}
