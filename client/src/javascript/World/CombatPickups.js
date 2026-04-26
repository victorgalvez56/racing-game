import * as THREE from 'three'

const RESPAWN_MS      = 9000
const COLLECT_DIST_SQ = 3 ** 2
const BOB_AMP         = 0.32
const BOB_SPEED       = 0.0018   // rad/ms
const SPIN_SPEED      = 0.0014
const DEFAULT_BASE_Z  = 1.3

// Pickup positions distributed around the racetrack
const TRACK_PICKUPS = [
    { x:  22, y: -35, type: 'ammo',   value: 5  },
    { x:  58, y:  -8, type: 'health', value: 40 },
    { x:   0, y:  42, type: 'ammo',   value: 5  },
    { x: -42, y:  -5, type: 'health', value: 40 },
    { x:  15, y:  41, type: 'ammo',   value: 5  },
    { x: -20, y: -38, type: 'health', value: 40 },
]

// Pickup positions inside the combat arena (100×100 with skatepark features).
// Pickups on elevated surfaces have explicit z baselines so they float above
// the obstacle, not the floor.
export const ARENA_PICKUPS = [
    // Plateau apex — highest-value health, requires climbing a ramp
    { x:   0, y:   0, z: 2.5,  type: 'health', value: 50 },

    // Inside the skate bowl (NE quadrant)
    { x:  28, y:  28, z: 1.3,  type: 'health', value: 35 },
    { x:  24, y:  32, z: 1.3,  type: 'ammo',   value: 6  },

    // Top of stairs deck (NW quadrant)
    { x: -28, y:  35, z: 3.3,  type: 'ammo',   value: 6  },

    // Big kicker landing zone (SE quadrant)
    { x:  28, y: -36, z: 1.3,  type: 'ammo',   value: 6  },

    // Spine crest (SW quadrant)
    { x: -28, y: -28, z: 2.9,  type: 'ammo',   value: 6  },

    // Spawn corridor — easy starter resources
    { x:   0, y: -28, z: 1.3,  type: 'health', value: 30 },

    // Mid-arena open spaces between trees
    { x:  12, y: -10, z: 1.3,  type: 'health', value: 30 },
    { x: -12, y:  10, z: 1.3,  type: 'health', value: 30 },
]

// ── Builders for the visuals ────────────────────────────────────────────────

function buildHealthMesh()
{
    // Octahedron crystal — green, faceted
    const group = new THREE.Group()

    const coreGeo = new THREE.OctahedronGeometry(0.55, 0)
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x2eff7a })
    const core    = new THREE.Mesh(coreGeo, coreMat)
    group.add(core)

    // Inner additive layer for "energy" feel
    const innerGeo = new THREE.OctahedronGeometry(0.4, 0)
    const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const inner = new THREE.Mesh(innerGeo, innerMat)
    inner.rotation.set(Math.PI / 4, 0, Math.PI / 4)
    group.add(inner)

    return group
}

function buildHealthGlow()
{
    const geo = new THREE.OctahedronGeometry(0.95, 0)
    const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff66, transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false,
    })
    return new THREE.Mesh(geo, mat)
}

function buildAmmoMesh()
{
    // Stylized missile — cylinder body + cone tip + 4 fins, tilted upward
    const group = new THREE.Group()

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 1.0, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa44 }),
    )
    group.add(body)

    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4422 }),
    )
    nose.position.y = 0.7
    group.add(nose)

    // 4 small fins around the base
    const finGeo = new THREE.BoxGeometry(0.06, 0.35, 0.30)
    const finMat = new THREE.MeshBasicMaterial({ color: 0xff8800 })
    for(let i = 0; i < 4; i++)
    {
        const fin = new THREE.Mesh(finGeo, finMat)
        const a   = (i / 4) * Math.PI * 2
        fin.position.set(Math.cos(a) * 0.22, -0.4, Math.sin(a) * 0.22)
        fin.rotation.y = a
        group.add(fin)
    }

    // Tilt the whole missile up at 25° so it points skyward (more visible)
    group.rotation.x = -Math.PI / 7
    return group
}

function buildAmmoGlow()
{
    const geo = new THREE.SphereGeometry(0.9, 10, 8)
    const mat = new THREE.MeshBasicMaterial({
        color: 0xff6600, transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, depthWrite: false,
    })
    return new THREE.Mesh(geo, mat)
}

function buildDisc(color)
{
    // Floor indicator — ring + filled disc on the ground at each pickup
    const group = new THREE.Group()

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.05, 32),
        new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
        }),
    )
    group.add(ring)

    const fill = new THREE.Mesh(
        new THREE.RingGeometry(0, 0.85, 24),
        new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
        }),
    )
    group.add(fill)

    return group
}

export default class CombatPickups
{
    constructor(_options)
    {
        this.scene     = _options.scene
        this.physics   = _options.physics
        this.onCollect = _options.onCollect
        this.layout    = _options.layout

        this._defs  = (this.layout === 'arena') ? ARENA_PICKUPS : TRACK_PICKUPS
        this._items = []
        this._t     = 0
        this._build()
    }

    _build()
    {
        this._defs.forEach((def, i) =>
        {
            const isAmmo  = def.type === 'ammo'
            const baseZ   = def.z ?? DEFAULT_BASE_Z
            const groundZ = (def.z !== undefined) ? def.z - DEFAULT_BASE_Z : 0

            const mesh = isAmmo ? buildAmmoMesh()  : buildHealthMesh()
            const glow = isAmmo ? buildAmmoGlow()  : buildHealthGlow()
            const disc = buildDisc(isAmmo ? 0xff6600 : 0x00ff66)

            mesh.position.set(def.x, def.y, baseZ)
            glow.position.set(def.x, def.y, baseZ)
            disc.position.set(def.x, def.y, groundZ + 0.02)

            mesh.frustumCulled = false
            glow.frustumCulled = false
            disc.frustumCulled = false

            this.scene.add(mesh)
            this.scene.add(glow)
            this.scene.add(disc)

            this._items.push({
                ...def, idx: i,
                baseZ,
                mesh, glow, disc,
                active: true,
                respawnAt: null,
            })
        })
    }

    update(dt)
    {
        this._t += dt
        const now  = Date.now()
        const body = this.physics.car.chassis.body
        const px   = body.position.x
        const py   = body.position.y

        for(const item of this._items)
        {
            // Respawn
            if(!item.active && item.respawnAt && now >= item.respawnAt)
            {
                item.active = true
                item.respawnAt = null
                item.mesh.visible = true
                item.glow.visible = true
                item.disc.visible = true
            }

            if(!item.active) continue

            // Animate (bob + rotate)
            const bob = Math.sin(this._t * BOB_SPEED + item.idx * 1.1) * BOB_AMP
            const rot = this._t * SPIN_SPEED + item.idx * 0.9

            item.mesh.position.z = item.baseZ + bob
            item.glow.position.z = item.baseZ + bob

            item.mesh.rotation.z = rot
            item.glow.rotation.z = rot

            // Slow rotation on the floor disc for a "scanning" feel
            item.disc.rotation.z = -rot * 0.5

            // Pulse the glow opacity
            const pulse = 0.6 + Math.sin(this._t * 0.004 + item.idx) * 0.4
            if(item.glow.material) item.glow.material.opacity = 0.28 * pulse

            // Collect
            const dx = item.x - px, dy = item.y - py
            const dz = item.baseZ - body.position.z
            if(dx * dx + dy * dy < COLLECT_DIST_SQ && Math.abs(dz) < 2.5)
            {
                item.active    = false
                item.respawnAt = now + RESPAWN_MS
                item.mesh.visible = false
                item.glow.visible = false
                item.disc.visible = false
                if(this.onCollect) this.onCollect({ type: item.type, value: item.value })
            }
        }
    }
}
