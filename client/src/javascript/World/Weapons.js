import * as THREE from 'three'

// ── Constants ────────────────────────────────────────────────────────────────
const SPEED          = 65       // m/s
const LIFE_MS        = 3500
const COOLDOWN_MS    = 850
const CAR_HIT_SQ     = 2.8 ** 2
const WALL_SQ        = (7 + 1.5) ** 2
const HOMING_RATE    = 2.5      // rad/s max turn toward target
const TRAIL_SAMPLES  = 28       // history points kept per missile
const TRAIL_DIST     = 0.18     // meters between trail samples

// ── Canvas textures ──────────────────────────────────────────────────────────

function makeFireTex()
{
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0,    'rgba(255, 220, 120, 1)')
    g.addColorStop(0.35, 'rgba(255, 100,  20, 0.85)')
    g.addColorStop(0.75, 'rgba(255,  40,   0, 0.4)')
    g.addColorStop(1,    'rgba(0,     0,   0, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
}

function makeSmokeTex()
{
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0,   'rgba(55, 55, 55, 0.9)')
    g.addColorStop(0.5, 'rgba(25, 25, 25, 0.5)')
    g.addColorStop(1,   'rgba( 0,  0,  0, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
}

// ── Weapons class ────────────────────────────────────────────────────────────

export default class Weapons
{
    constructor(_options)
    {
        this.scene            = _options.scene
        this.physics          = _options.physics
        this.centerPath       = _options.centerPath   || []
        this.remoteCarManager = _options.remoteCarManager || null
        this.onHitCar         = _options.onHitCar     || null
        this.onFire           = _options.onFire        || null

        this.onFired     = _options.onFired     || null   // (x,y,z,dx,dy) → network sync
        this.onExploded  = _options.onExploded  || null   // (x,y,z) → network sync

        this.ammo      = 10
        this._cooldown = 0
        this._missiles  = []
        this._effects   = []    // sprites (explosions, smoke)
        this._debris    = []    // flying chunks with gravity

        this._fireTex  = makeFireTex()
        this._smokeTex = makeSmokeTex()
    }

    // ── Public ───────────────────────────────────────────────────────────────

    fire()
    {
        if(this.ammo <= 0 || this._cooldown > 0) return false

        const body = this.physics.car.chassis.body
        const q    = body.quaternion
        const hx   = 1 - 2 * (q.y * q.y + q.z * q.z)
        const hy   = 2 * (q.x * q.y + q.z * q.w)
        const len  = Math.sqrt(hx * hx + hy * hy) || 1
        const dx   = hx / len, dy = hy / len

        const p  = body.position
        const sx = p.x + dx * 3.2
        const sy = p.y + dy * 3.2
        const sz = p.z + 0.45
        this._spawnMissile(sx, sy, sz, dx, dy, false)

        this.ammo--
        this._cooldown = COOLDOWN_MS
        if(this.onFire)  this.onFire()
        if(this.onFired) this.onFired(sx, sy, sz, dx, dy)
        return true
    }

    // Spawns a visual-only missile from a remote player (no hit detection, no homing)
    spawnRemoteMissile(x, y, z, dx, dy)
    {
        this._spawnMissile(x, y, z, dx, dy, true)
    }

    addAmmo(n) { this.ammo = Math.min(this.ammo + n, 20) }

    // ── Update loop ───────────────────────────────────────────────────────────

    update(dt)
    {
        this._cooldown = Math.max(0, this._cooldown - dt)
        this._updateMissiles(dt)
        this._updateEffects(dt)
        this._updateDebris(dt)
    }

    // ── Missile logic ─────────────────────────────────────────────────────────

    _spawnMissile(x, y, z, dx, dy, isRemote = false)
    {
        // Visual group: cylinder body + cone nose + engine glow
        const group = new THREE.Group()

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.12, 0.75, 7),
            new THREE.MeshBasicMaterial({ color: 0x888888 })
        )
        group.add(body)

        const nose = new THREE.Mesh(
            new THREE.ConeGeometry(0.09, 0.28, 7),
            new THREE.MeshBasicMaterial({ color: 0xff4400 })
        )
        nose.position.y = 0.51
        group.add(nose)

        const eng = new THREE.Mesh(
            new THREE.SphereGeometry(0.20, 6, 4),
            new THREE.MeshBasicMaterial({
                color: 0xff9900, transparent: true, opacity: 0.75,
                blending: THREE.AdditiveBlending, depthWrite: false,
            })
        )
        eng.position.y = -0.44
        group.add(eng)

        // Rotate group so local +Y points in direction of travel
        // After rotation.z = θ, new Y = (-sinθ, cosθ)
        // We want (-sinθ, cosθ) = (dx, dy) → θ = atan2(-dx, dy)
        group.rotation.z = Math.atan2(-dx, dy)
        group.position.set(x, y, z)
        group.frustumCulled = false
        this.scene.add(group)

        // Trail: Points with vertex colors (additive — fades to black = invisible)
        const posArr = new Float32Array(TRAIL_SAMPLES * 3)
        const colArr = new Float32Array(TRAIL_SAMPLES * 3)
        // Init all points at spawn, black (invisible)
        for(let i = 0; i < TRAIL_SAMPLES; i++)
        {
            posArr[i * 3] = x; posArr[i * 3 + 1] = y; posArr[i * 3 + 2] = z
        }

        const tGeo = new THREE.BufferGeometry()
        const posAttr = new THREE.BufferAttribute(posArr, 3)
        const colAttr = new THREE.BufferAttribute(colArr, 3)
        posAttr.setUsage(THREE.DynamicDrawUsage)
        colAttr.setUsage(THREE.DynamicDrawUsage)
        tGeo.setAttribute('position', posAttr)
        tGeo.setAttribute('color',    colAttr)

        const tMat = new THREE.PointsMaterial({
            size:            1.6,
            sizeAttenuation: true,
            map:             this._fireTex,
            vertexColors:    true,
            transparent:     true,
            opacity:         1.0,
            blending:        THREE.AdditiveBlending,
            depthWrite:      false,
        })

        const trail = new THREE.Points(tGeo, tMat)
        trail.frustumCulled = false
        this.scene.add(trail)

        this._missiles.push({
            x, y, z, dx, dy,
            life:    0,
            group,
            trail,
            posAttr, colAttr,
            history: [],
            traveled: 0,
            isRemote,
        })
    }

    _updateMissiles(dt)
    {
        for(let i = this._missiles.length - 1; i >= 0; i--)
        {
            const m = this._missiles[i]
            m.life += dt

            if(m.life > LIFE_MS) { this._explode(m); this._removeMissile(i); continue }

            // Homing toward nearest remote car (local missiles only)
            if(!m.isRemote)
            {
                const tgt = this._nearestTarget(m.x, m.y)
                if(tgt)
                {
                    const tx = tgt.x - m.x, ty = tgt.y - m.y
                    const tl = Math.sqrt(tx * tx + ty * ty)
                    if(tl > 1)
                    {
                        const rate = Math.min(HOMING_RATE * dt / 1000, 0.15)
                        m.dx += (tx / tl - m.dx) * rate
                        m.dy += (ty / tl - m.dy) * rate
                        const l = Math.sqrt(m.dx * m.dx + m.dy * m.dy) || 1
                        m.dx /= l; m.dy /= l
                    }
                }
            }

            const dist = SPEED * dt / 1000
            m.x += m.dx * dist
            m.y += m.dy * dist
            m.traveled += dist

            m.group.position.set(m.x, m.y, m.z)
            m.group.rotation.z = Math.atan2(-m.dx, m.dy)

            // Wall collision
            if(this._offTrack(m.x, m.y)) { this._explode(m); this._removeMissile(i); continue }

            // Remote car collision (local missiles only — remote missiles don't deal damage)
            let hit = false
            if(!m.isRemote && this.remoteCarManager)
            {
                for(const [id, car] of this.remoteCarManager.cars)
                {
                    const cp = car.container.position
                    const dx = cp.x - m.x, dy = cp.y - m.y, dz = cp.z - m.z
                    if(dx * dx + dy * dy + dz * dz < CAR_HIT_SQ)
                    {
                        this._explode(m)
                        this._removeMissile(i)
                        if(this.onHitCar) this.onHitCar(id, 30)
                        hit = true; break
                    }
                }
            }
            if(hit) continue

            // Trail sampling
            if(m.traveled >= TRAIL_DIST)
            {
                m.history.unshift({ x: m.x, y: m.y, z: m.z })
                if(m.history.length > TRAIL_SAMPLES) m.history.pop()
                m.traveled = 0
            }
            this._refreshTrail(m)
        }
    }

    _refreshTrail(m)
    {
        const h   = m.history
        const pos = m.posAttr.array
        const col = m.colAttr.array

        for(let i = 0; i < TRAIL_SAMPLES; i++)
        {
            const pt = h[i]
            if(pt)
            {
                pos[i * 3]     = pt.x
                pos[i * 3 + 1] = pt.y
                pos[i * 3 + 2] = pt.z
                // Brightness fades head→tail; with AdditiveBlending black = invisible
                const t        = i / TRAIL_SAMPLES
                const bright   = Math.pow(1 - t, 1.6)
                col[i * 3]     = bright          // R
                col[i * 3 + 1] = bright * 0.32   // G (orange tint)
                col[i * 3 + 2] = 0               // B
            }
            else
            {
                // Not yet history — collapse at current missile pos (black)
                pos[i * 3]     = m.x
                pos[i * 3 + 1] = m.y
                pos[i * 3 + 2] = m.z
                col[i * 3]     = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0
            }
        }

        m.posAttr.needsUpdate = true
        m.colAttr.needsUpdate = true
    }

    _removeMissile(i)
    {
        const m = this._missiles[i]
        this.scene.remove(m.group)
        this.scene.remove(m.trail)
        m.trail.geometry.dispose()
        m.trail.material.dispose()
        this._missiles.splice(i, 1)
    }

    // ── Explosion ─────────────────────────────────────────────────────────────

    // Public: spawn explosion at arbitrary position (for remote events)
    _explodeAt(x, y, z)
    {
        this._spawnExplosionFX(x, y, z)
    }

    _explode(m)
    {
        const { x, y, z } = m
        if(!m.isRemote && this.onExploded) this.onExploded(x, y, z)
        this._spawnExplosionFX(x, y, z)
    }

    _spawnExplosionFX(x, y, z)
    {
        // 1. Instant white core flash
        this._addSprite(x, y, z + 0.5, 0xffffff, 1.0, 1.5, 4.0, 160,  false)
        // 2. Orange fireball
        this._addSprite(x, y, z + 0.5, 0xff7700, 0.85, 3.0, 5.5, 520, false)
        // 3. Outer dark ring
        this._addSprite(x, y, z + 0.3, 0xff3300, 0.55, 4.0, 3.5, 700, false)
        // 4. Rising smoke puffs
        for(let k = 0; k < 4; k++)
        {
            this._addSprite(
                x + (Math.random() - 0.5) * 2,
                y + (Math.random() - 0.5) * 2,
                z + 0.5 + k * 0.6,
                0x333333, 0.55, 1.8, 2.0, 1100 + k * 200, true
            )
        }
        // 5. Debris chunks with gravity
        for(let j = 0; j < 7; j++)
        {
            const angle = (j / 7) * Math.PI * 2 + Math.random() * 0.4
            const spd   = 5 + Math.random() * 6
            this._addDebris(
                x, y, z,
                Math.cos(angle) * spd,
                Math.sin(angle) * spd,
                3 + Math.random() * 5
            )
        }
    }

    // Massive car-destruction explosion: fireball + smoke + chassis chunks + flying wheels
    explodeCar(x, y, z, vx = 0, vy = 0, bodyColor = 0x222222)
    {
        // 1. Bright white core flash (bigger and longer)
        this._addSprite(x, y, z + 0.5, 0xffffff, 1.0, 2.5, 8.0, 240, false)
        // 2. Massive orange fireball
        this._addSprite(x, y, z + 0.6, 0xff7700, 0.95, 5.0, 11.0, 800, false)
        // 3. Secondary red flash
        this._addSprite(x, y, z + 0.4, 0xff3300, 0.7, 4.5, 7.0, 950, false)
        // 4. Shockwave ring (low and wide)
        this._addSprite(x, y, z + 0.1, 0xffaa44, 0.5, 1.0, 8.0, 600, false)
        // 5. Thick rising smoke column
        for(let k = 0; k < 10; k++)
        {
            this._addSprite(
                x + (Math.random() - 0.5) * 3.5,
                y + (Math.random() - 0.5) * 3.5,
                z + 0.5 + k * 0.55,
                0x1a1a1a, 0.65, 2.5, 4.5, 1700 + k * 220, true
            )
        }
        // 6. Body-color paint chunks (small, fast)
        for(let j = 0; j < 8; j++)
        {
            const angle = (j / 8) * Math.PI * 2 + Math.random() * 0.5
            const spd   = 7 + Math.random() * 8
            this._addDebris(
                x, y, z + 0.5,
                Math.cos(angle) * spd + vx * 0.4,
                Math.sin(angle) * spd + vy * 0.4,
                5 + Math.random() * 7,
                bodyColor, 0.22 + Math.random() * 0.18, 1700 + Math.random() * 600
            )
        }
        // 7. Larger dark chassis chunks
        for(let j = 0; j < 6; j++)
        {
            const angle = (j / 6) * Math.PI * 2 + Math.random() * 0.6
            const spd   = 5 + Math.random() * 7
            this._addDebris(
                x, y, z + 0.4,
                Math.cos(angle) * spd + vx * 0.4,
                Math.sin(angle) * spd + vy * 0.4,
                4 + Math.random() * 6,
                0x1a1a1a, 0.32 + Math.random() * 0.22, 1900 + Math.random() * 500
            )
        }
        // 8. Four flying wheels (cylinders)
        for(let w = 0; w < 4; w++)
        {
            const angle = (w / 4) * Math.PI * 2 + Math.random() * 0.4
            const spd   = 4.5 + Math.random() * 5
            this._addWheelDebris(
                x, y, z + 0.35,
                Math.cos(angle) * spd + vx * 0.5,
                Math.sin(angle) * spd + vy * 0.5,
                3.5 + Math.random() * 5
            )
        }
    }

    _addWheelDebris(x, y, z, vx, vy, vz)
    {
        const mat  = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 })
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.22, 14), mat)
        mesh.rotation.x = Math.random() * Math.PI
        mesh.rotation.z = Math.random() * Math.PI
        mesh.position.set(x, y, z)
        mesh.frustumCulled = false
        this.scene.add(mesh)
        this._debris.push({
            mesh, mat, x, y, z, vx, vy, vz,
            t: 0, dur: 2200 + Math.random() * 600,
            spinX: 6 + Math.random() * 5,
            spinY: 4 + Math.random() * 4,
        })
    }

    _addSprite(x, y, z, color, opacity, scaleStart, scaleEnd, dur, isSmoke)
    {
        const mat = new THREE.SpriteMaterial({
            map:         isSmoke ? this._smokeTex : this._fireTex,
            color,
            transparent: true,
            opacity,
            blending:    isSmoke ? THREE.NormalBlending : THREE.AdditiveBlending,
            depthWrite:  false,
        })
        const sprite = new THREE.Sprite(mat)
        sprite.scale.setScalar(scaleStart)
        sprite.position.set(x, y, z)
        sprite.frustumCulled = false
        this.scene.add(sprite)
        this._effects.push({ sprite, mat, t: 0, dur, scaleStart, scaleEnd, startOpacity: opacity, isSmoke })
    }

    _addDebris(x, y, z, vx, vy, vz, color = 0x1a1a1a, size = null, dur = null)
    {
        const s   = size !== null ? size : 0.18 + Math.random() * 0.22
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 0.7), mat)
        mesh.position.set(x, y, z)
        mesh.frustumCulled = false
        this.scene.add(mesh)
        this._debris.push({
            mesh, mat, x, y, z, vx, vy, vz,
            t: 0, dur: dur !== null ? dur : 1100 + Math.random() * 500,
        })
    }

    // ── Effect & debris update ────────────────────────────────────────────────

    _updateEffects(dt)
    {
        for(let i = this._effects.length - 1; i >= 0; i--)
        {
            const e = this._effects[i]
            e.t += dt
            const p = Math.min(e.t / e.dur, 1)
            if(p >= 1)
            {
                this.scene.remove(e.sprite)
                e.mat.dispose()
                this._effects.splice(i, 1)
                continue
            }
            e.sprite.scale.setScalar(THREE.MathUtils.lerp(e.scaleStart, e.scaleEnd, p))
            e.mat.opacity = e.startOpacity * (1 - p)
            if(e.isSmoke) e.sprite.position.z += dt * 0.0018  // smoke rises
        }
    }

    _updateDebris(dt)
    {
        const dtS = dt / 1000
        for(let i = this._debris.length - 1; i >= 0; i--)
        {
            const d = this._debris[i]
            d.t += dt
            const p = d.t / d.dur
            if(p >= 1)
            {
                this.scene.remove(d.mesh)
                d.mat.dispose()
                this._debris.splice(i, 1)
                continue
            }
            d.vz -= 9.8 * dtS
            d.x  += d.vx * dtS
            d.y  += d.vy * dtS
            const newZ = d.z + d.vz * dtS
            if(newZ <= 0.15)
            {
                // Bounce with damping when hitting ground
                d.z   = 0.15
                if(d.vz < -1) { d.vz *= -0.35; d.vx *= 0.7; d.vy *= 0.7 }
                else d.vz = 0
            }
            else d.z = newZ
            d.mesh.position.set(d.x, d.y, d.z)
            d.mesh.rotation.x += dtS * (d.spinX || 3.5)
            d.mesh.rotation.y += dtS * (d.spinY || 2.2)
            d.mat.opacity = Math.max(0, 1 - p * 1.4)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _nearestTarget(x, y)
    {
        if(!this.remoteCarManager || this.remoteCarManager.cars.size === 0) return null
        let best = null, bestSq = 55 ** 2
        for(const [, car] of this.remoteCarManager.cars)
        {
            const p = car.container.position
            const dx = p.x - x, dy = p.y - y
            const sq = dx * dx + dy * dy
            if(sq < bestSq) { bestSq = sq; best = p }
        }
        return best
    }

    _offTrack(x, y)
    {
        // No racetrack? (combat arena) — never auto-explode for being "off"
        if(!this.centerPath || this.centerPath.length === 0) return false

        let minSq = Infinity
        for(const pt of this.centerPath)
        {
            const dx = pt.x - x, dy = pt.y - y
            const sq = dx * dx + dy * dy
            if(sq < minSq) minSq = sq
        }
        return minSq > WALL_SQ
    }
}
