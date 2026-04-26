import * as THREE from 'three'
import CANNON from 'cannon'

const HEAL_INTERVAL_MS = 250    // 4 ticks/sec
const HEAL_PER_TICK    = 2      // 2 HP × 4 = 8 HP/sec
const BOOST_FORCE      = 1500
const PULSE_SPEED      = 0.005

// ── Procedural texture for the boost zone (radial up-arrow + glow) ─────────
function makeBoostTex()
{
    const SZ = 256
    const c  = document.createElement('canvas')
    c.width = c.height = SZ
    const ctx = c.getContext('2d')

    // Soft radial glow base
    const g = ctx.createRadialGradient(SZ/2, SZ/2, 0, SZ/2, SZ/2, SZ/2)
    g.addColorStop(0,   'rgba(255, 182, 39, 0.85)')
    g.addColorStop(0.4, 'rgba(255, 182, 39, 0.45)')
    g.addColorStop(1,   'rgba(255, 182, 39, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SZ, SZ)

    // Stack of 3 chevrons pointing up, fading toward the tip
    ctx.lineWidth = 14
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const chevrons = [
        { y: 80,  alpha: 1.0 },
        { y: 130, alpha: 0.7 },
        { y: 180, alpha: 0.4 },
    ]
    for(const ch of chevrons)
    {
        ctx.strokeStyle = `rgba(255, 255, 255, ${ch.alpha})`
        ctx.beginPath()
        ctx.moveTo(SZ/2 - 50, ch.y + 30)
        ctx.lineTo(SZ/2,        ch.y)
        ctx.lineTo(SZ/2 + 50, ch.y + 30)
        ctx.stroke()
    }

    return new THREE.CanvasTexture(c)
}

// ── HazardZones class ──────────────────────────────────────────────────────
export default class HazardZones
{
    constructor(_options)
    {
        this.scene        = _options.scene
        this.physics      = _options.physics
        this.healthSystem = _options.healthSystem

        this._zones      = []
        this._t          = 0
        this._healAccum  = 0
        this._inHealing  = false      // for visual feedback if needed
        this._inBoost    = false

        this._build()
    }

    _build()
    {
        // Healing zone: defensive recovery near the spawn corridor
        this._addHealing(0, -32, 4)

        // Boost zones in the east and west corridors — long open lanes
        // that benefit from the extra speed
        this._addBoost(-38,  0, 4)
        this._addBoost( 38,  0, 4)
    }

    // Lightweight summary for the minimap (no THREE.js objects, just data)
    getMinimapZones()
    {
        return this._zones.map(z => ({
            x: z.x, y: z.y, radius: Math.sqrt(z.radiusSq), type: z.type,
        }))
    }

    // ── Healing zone (green ring + filled disc + plus icon) ────────────────
    _addHealing(x, y, radius)
    {
        // Outer ring — bright green, semi-transparent
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.78, radius, 48),
            new THREE.MeshBasicMaterial({
                color: 0x00ff66, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
            }),
        )
        ring.position.set(x, y, 0.020)
        this.scene.add(ring)

        // Inner fill — dim, pulses
        const fill = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.78, 36),
            new THREE.MeshBasicMaterial({
                color: 0x00ff66, transparent: true, opacity: 0.18,
            }),
        )
        fill.position.set(x, y, 0.019)
        this.scene.add(fill)

        // Plus / cross icon at the center
        const armW = radius * 1.05
        const armH = radius * 0.20
        const plusMat = new THREE.MeshBasicMaterial({
            color: 0x88ffaa, transparent: true, opacity: 0.85,
        })

        const plusH = new THREE.Mesh(new THREE.PlaneGeometry(armW, armH), plusMat)
        plusH.position.set(x, y, 0.022)
        this.scene.add(plusH)

        const plusV = new THREE.Mesh(new THREE.PlaneGeometry(armH, armW), plusMat)
        plusV.position.set(x, y, 0.022)
        this.scene.add(plusV)

        this._zones.push({
            type: 'healing',
            x, y, radiusSq: radius * radius,
            ring, fill,
        })
    }

    // ── Boost zone (amber arrow texture inside a ring) ─────────────────────
    _addBoost(x, y, radius)
    {
        // Outer ring
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.80, radius, 48),
            new THREE.MeshBasicMaterial({
                color: 0xffb627, transparent: true, opacity: 0.65, side: THREE.DoubleSide,
            }),
        )
        ring.position.set(x, y, 0.020)
        this.scene.add(ring)

        // Inner arrow texture — points "up" but rotates so the visual feels alive
        const fill = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 0.80, 36),
            new THREE.MeshBasicMaterial({
                map: makeBoostTex(),
                transparent: true,
                opacity: 0.85,
                depthWrite: false,
            }),
        )
        fill.position.set(x, y, 0.019)
        this.scene.add(fill)

        this._zones.push({
            type: 'boost',
            x, y, radiusSq: radius * radius,
            ring, fill,
        })
    }

    // ── Tick: animate visuals + apply zone effects to the local car ────────
    update(dt)
    {
        this._t += dt

        // Animate every zone's visuals
        for(const z of this._zones)
        {
            const pulse = 0.6 + Math.sin(this._t * PULSE_SPEED + z.x * 0.12) * 0.4
            if(z.fill?.material)
                z.fill.material.opacity = (z.type === 'healing' ? 0.18 : 0.85) * pulse
            if(z.ring) z.ring.rotation.z += dt * 0.0008
            if(z.fill) z.fill.rotation.z -= dt * 0.0014
        }

        // Effects only apply to the local car when it's near the ground
        const body = this.physics?.car?.chassis?.body
        if(!body)
        {
            this._healAccum = 0
            return
        }

        const px = body.position.x
        const py = body.position.y
        const pz = body.position.z

        // Skip if airborne (jumped off a ramp) so zones don't fire mid-air
        if(pz > 1.5)
        {
            this._healAccum = 0
            this._inHealing = false
            this._inBoost = false
            return
        }

        let inHealing = false
        let inBoost   = false

        for(const z of this._zones)
        {
            const dx = z.x - px, dy = z.y - py
            if(dx * dx + dy * dy > z.radiusSq) continue

            if(z.type === 'healing')
            {
                inHealing = true
            }
            else if(z.type === 'boost')
            {
                inBoost = true
                // Amplify motion — apply force in the car's velocity direction.
                // If almost stopped, fall back to the car's facing direction.
                const vx = body.velocity.x
                const vy = body.velocity.y
                const speed = Math.sqrt(vx * vx + vy * vy)

                let ux, uy
                if(speed > 1)
                {
                    ux = vx / speed
                    uy = vy / speed
                }
                else
                {
                    const q  = body.quaternion
                    const fx = 1 - 2 * (q.y * q.y + q.z * q.z)
                    const fy = 2 * (q.x * q.y + q.z * q.w)
                    const len = Math.sqrt(fx * fx + fy * fy) || 1
                    ux = fx / len
                    uy = fy / len
                }

                body.applyForce(
                    new CANNON.Vec3(ux * BOOST_FORCE, uy * BOOST_FORCE, 0),
                    body.position,
                )
            }
        }

        // Healing tick — only when inside a healing zone and alive
        if(inHealing && this.healthSystem && !this.healthSystem.isDead())
        {
            this._healAccum += dt
            while(this._healAccum >= HEAL_INTERVAL_MS)
            {
                this.healthSystem.heal(HEAL_PER_TICK)
                this._healAccum -= HEAL_INTERVAL_MS
            }
        }
        else
        {
            this._healAccum = 0
        }

        this._inHealing = inHealing
        this._inBoost   = inBoost
    }
}
