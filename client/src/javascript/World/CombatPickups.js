import * as THREE from 'three'

const RESPAWN_MS      = 9000
const COLLECT_DIST_SQ = 3 ** 2
const BOB_AMP         = 0.28
const BOB_SPEED       = 0.0018   // rad/ms
const SPIN_SPEED      = 0.0012

// Pickup positions distributed around the racetrack
const TRACK_PICKUPS = [
    { x:  22, y: -35, type: 'ammo',   value: 5  },   // bottom straight
    { x:  58, y:  -8, type: 'health', value: 40 },   // right hairpin exit
    { x:   0, y:  42, type: 'ammo',   value: 5  },   // top
    { x: -42, y:  -5, type: 'health', value: 40 },   // left turn
    { x:  15, y:  41, type: 'ammo',   value: 5  },   // top straight (boost area)
    { x: -20, y: -38, type: 'health', value: 40 },   // lower left
]

// Pickup positions inside the combat arena (80×80 centered at origin).
// Placed in the gaps between obstacles to reward map awareness.
const ARENA_PICKUPS = [
    { x:   0, y:   0, type: 'health', value: 40 },   // dead center — risky
    { x:  16, y:  16, type: 'ammo',   value: 5  },   // NE corridor
    { x: -16, y:  16, type: 'ammo',   value: 5  },   // NW corridor
    { x:  16, y: -16, type: 'ammo',   value: 5  },   // SE corridor
    { x: -16, y: -16, type: 'ammo',   value: 5  },   // SW corridor
    { x:   0, y:  28, type: 'health', value: 40 },   // north edge
    { x:   0, y: -28, type: 'health', value: 40 },   // south edge (near spawn)
    { x:  32, y:   0, type: 'ammo',   value: 5  },   // east wall
    { x: -32, y:   0, type: 'ammo',   value: 5  },   // west wall
]

export default class CombatPickups
{
    constructor(_options)
    {
        this.scene     = _options.scene
        this.physics   = _options.physics
        this.onCollect = _options.onCollect    // ({ type, value }) => {}
        this.layout    = _options.layout       // 'track' | 'arena'

        this._defs  = (this.layout === 'arena') ? ARENA_PICKUPS : TRACK_PICKUPS
        this._items = []
        this._t     = 0
        this._build()
    }

    _build()
    {
        const geoAmmo   = new THREE.BoxGeometry(1.0, 1.0, 1.0)
        const geoHealth = new THREE.SphereGeometry(0.65, 8, 6)

        const matAmmo = new THREE.MeshBasicMaterial({
            color: 0xff8800, transparent: true, opacity: 0.88,
        })
        const matAmmoGlow = new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 0.25,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
        const matHealth = new THREE.MeshBasicMaterial({
            color: 0x00dd55, transparent: true, opacity: 0.88,
        })
        const matHealthGlow = new THREE.MeshBasicMaterial({
            color: 0x00ff44, transparent: true, opacity: 0.22,
            blending: THREE.AdditiveBlending, depthWrite: false,
        })
        const glowGeo = new THREE.SphereGeometry(1.1, 8, 6)

        this._defs.forEach((def, i) =>
        {
            const isAmmo   = def.type === 'ammo'
            const geo      = isAmmo ? geoAmmo : geoHealth
            const mat      = isAmmo ? matAmmo : matHealth
            const glowMat  = isAmmo ? matAmmoGlow : matHealthGlow

            const mesh = new THREE.Mesh(geo, mat)
            const glow = new THREE.Mesh(glowGeo, glowMat)

            mesh.position.set(def.x, def.y, 1.3)
            glow.position.set(def.x, def.y, 1.3)
            mesh.frustumCulled = false
            glow.frustumCulled = false

            this.scene.add(mesh)
            this.scene.add(glow)

            this._items.push({
                ...def, idx: i,
                mesh, glow,
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
            }

            if(!item.active) continue

            // Animate
            const z = 1.3 + Math.sin(this._t * BOB_SPEED + item.idx * 1.1) * BOB_AMP
            const r = this._t * SPIN_SPEED + item.idx * 0.9
            item.mesh.position.z = z
            item.glow.position.z = z
            item.mesh.rotation.z = r
            item.glow.rotation.z = r

            // Collect
            const dx = item.x - px, dy = item.y - py
            if(dx * dx + dy * dy < COLLECT_DIST_SQ)
            {
                item.active    = false
                item.respawnAt = now + RESPAWN_MS
                item.mesh.visible = false
                item.glow.visible = false
                if(this.onCollect) this.onCollect({ type: item.type, value: item.value })
            }
        }
    }
}
