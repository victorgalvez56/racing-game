import * as THREE from 'three'

// ── Tunables ───────────────────────────────────────────────────────────────
const FALL_TIME           = 2200    // ms from spawn (high in sky) to impact
const SPAWN_HEIGHT        = 70      // meters above the arena floor
const IMPACT_RADIUS       = 5.5
const IMPACT_DAMAGE       = 32
const NEAR_DIST           = 14      // distance for sound + camera shake

// ── Meteors class ──────────────────────────────────────────────────────────
export default class Meteors
{
    constructor(_options)
    {
        this.scene        = _options.scene
        this.physics      = _options.physics
        this.healthSystem = _options.healthSystem
        this.weapons      = _options.weapons         // for _explodeAt() FX
        this.sounds       = _options.sounds || null
        this.shake        = _options.onShake  || null

        this._items = []
        this._t     = 0
    }

    // Server broadcasts 'combat:meteor' with a target XY; the client just
    // animates the visual + applies damage on impact. All clients see the
    // same shower because the schedule lives on the server.
    spawnAt(x, y)
    {
        this._spawn(x, y)
    }

    update(dt)
    {
        this._t += dt

        // Animate active meteors
        for(let i = this._items.length - 1; i >= 0; i--)
        {
            const m = this._items[i]
            m.elapsed += dt
            const p = m.elapsed / FALL_TIME

            if(p >= 1)
            {
                this._impact(m)
                this._remove(i)
                continue
            }

            // Smooth fall — slight ease-in (faster near end)
            const ease = p * p * (3 - 2 * p)   // smoothstep
            const z    = SPAWN_HEIGHT * (1 - ease) + 0.6
            m.mesh.position.z = z
            m.glow.position.set(m.x, m.y, z)

            // Tumble in flight
            m.mesh.rotation.x += dt * 0.004 * m.spin
            m.mesh.rotation.y += dt * 0.003 * m.spin
            m.mesh.rotation.z += dt * 0.002 * m.spin

            // Ring marker pulses faster as impact approaches
            const pulseRate = 0.005 + p * 0.02
            const pulse     = 0.5 + Math.sin(this._t * pulseRate * Math.PI) * 0.5
            const ringOp    = 0.25 + p * 0.55 + pulse * 0.20
            const fillOp    = 0.05 + p * 0.35
            if(m.ringMat) m.ringMat.opacity = Math.min(1, ringOp)
            if(m.fillMat) m.fillMat.opacity = Math.min(0.6, fillOp)

            // Marker scale shrinks slightly so it focuses to the point of impact
            const sc = 1 - p * 0.12
            m.ring.scale.setScalar(sc)
            m.fill.scale.setScalar(sc)

            // Glow opacity grows as it heats up on the way down
            m.glowMat.opacity = 0.35 + p * 0.45
        }
    }

    // ── Spawn ──────────────────────────────────────────────────────────────
    _spawn(x, y)
    {
        const radius = 0.8 + Math.random() * 0.6
        const spin   = 0.7 + Math.random() * 0.8

        // Meteor body — dark faceted rock (low-poly icosahedron)
        const meshGeo = new THREE.IcosahedronGeometry(radius, 0)
        const meshMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
        const mesh    = new THREE.Mesh(meshGeo, meshMat)
        mesh.position.set(x, y, SPAWN_HEIGHT)
        mesh.frustumCulled = false
        this.scene.add(mesh)

        // Hot additive glow halo (fire wrapping the rock)
        const glowGeo = new THREE.SphereGeometry(radius * 1.7, 12, 8)
        const glowMat = new THREE.MeshBasicMaterial({
            color:        0xff5522,
            transparent:  true,
            opacity:      0.35,
            blending:     THREE.AdditiveBlending,
            depthWrite:   false,
        })
        const glow = new THREE.Mesh(glowGeo, glowMat)
        glow.position.set(x, y, SPAWN_HEIGHT)
        glow.frustumCulled = false
        this.scene.add(glow)

        // Ground impact marker — outer ring + inner filled disc
        const ringGeo = new THREE.RingGeometry(IMPACT_RADIUS - 0.35, IMPACT_RADIUS, 48)
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff2e4d, transparent: true, opacity: 0.25,
            side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        ring.position.set(x, y, 0.022)
        this.scene.add(ring)

        const fillGeo = new THREE.CircleGeometry(IMPACT_RADIUS - 0.4, 36)
        const fillMat = new THREE.MeshBasicMaterial({
            color: 0xff2e4d, transparent: true, opacity: 0.05,
        })
        const fill = new THREE.Mesh(fillGeo, fillMat)
        fill.position.set(x, y, 0.021)
        this.scene.add(fill)

        this._items.push({
            x, y, elapsed: 0, spin,
            mesh, glow, ring, fill,
            glowMat, ringMat, fillMat,
        })
    }

    // ── Impact ─────────────────────────────────────────────────────────────
    _impact(m)
    {
        // Visual explosion always plays — it's environmental atmosphere
        if(this.weapons?._explodeAt) this.weapons._explodeAt(m.x, m.y, 0.5)

        const body = this.physics?.car?.chassis?.body
        if(!body) return

        const dx   = body.position.x - m.x
        const dy   = body.position.y - m.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Sound + camera shake only fire for nearby impacts so the screen
        // isn't shaking constantly with the dense meteor shower
        if(dist < NEAR_DIST)
        {
            this.sounds?.play('carHit', 14)
            this.shake?.()
        }

        // Damage local car if it's inside the impact radius and on the ground
        if(this.healthSystem?.isDead?.()) return
        if(dist < IMPACT_RADIUS && body.position.z < 4)
        {
            this.healthSystem?.takeDamage(IMPACT_DAMAGE)
        }
    }

    // ── Cleanup ────────────────────────────────────────────────────────────
    _remove(i)
    {
        const m = this._items[i]

        this.scene.remove(m.mesh)
        this.scene.remove(m.glow)
        this.scene.remove(m.ring)
        this.scene.remove(m.fill)

        m.mesh.geometry.dispose();    m.mesh.material.dispose()
        m.glow.geometry.dispose();    m.glowMat.dispose()
        m.ring.geometry.dispose();    m.ringMat.dispose()
        m.fill.geometry.dispose();    m.fillMat.dispose()

        this._items.splice(i, 1)
    }
}
