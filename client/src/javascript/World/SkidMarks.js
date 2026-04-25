import * as THREE from 'three'

const MAX_QUADS   = 400
const MIN_LATERAL = 2.8    // m/s lateral speed threshold to trigger marks
const MIN_SPEED   = 3.0    // m/s minimum total speed before marks appear
const MARK_HALF_W = 0.16   // half-width of a single wheel mark
const MARK_Z      = 0.035  // just above tarmac

export default class SkidMarks
{
    constructor(_options)
    {
        this.physics   = _options.physics
        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        // Two trailing positions — one per rear wheel
        this._prevPos = [null, null]

        // Flat typed array: MAX_QUADS * 2 triangles * 3 verts * 3 coords
        this._posArr  = new Float32Array(MAX_QUADS * 6 * 3)
        this._quadCnt = 0

        const geo = new THREE.BufferGeometry()
        this._attr = new THREE.BufferAttribute(this._posArr, 3)
        this._attr.setUsage(THREE.DynamicDrawUsage)
        geo.setAttribute('position', this._attr)
        geo.setDrawRange(0, 0)

        const mat = new THREE.MeshBasicMaterial({
            color:       0x060606,
            transparent: true,
            opacity:     0.45,
            depthWrite:  false,
            side:        THREE.DoubleSide,
        })

        this._mesh = new THREE.Mesh(geo, mat)
        this._mesh.frustumCulled = false
        this._mesh.matrixAutoUpdate = false
        this._mesh.updateMatrix()
        this.container.add(this._mesh)
    }

    update()
    {
        const body    = this.physics.car.chassis.body
        const vehicle = this.physics.car.vehicle
        const infos   = vehicle.wheelInfos

        // Compute lateral slip (cross product of heading and velocity in XY)
        const vel  = body.velocity
        const quat = body.quaternion
        const hx   =  1 - 2 * (quat.y * quat.y + quat.z * quat.z)
        const hy   =  2 * (quat.x * quat.y + quat.z * quat.w)
        const speed   = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
        const lateral = Math.abs(vel.x * hy - vel.y * hx)   // |cross product z|
        const skidding = speed > MIN_SPEED && lateral > MIN_LATERAL

        // Rear wheels are indices 2 and 3
        for(let wi = 2; wi <= 3; wi++)
        {
            const wp   = infos[wi].worldTransform.position
            const prev = this._prevPos[wi - 2]

            if(skidding && prev !== null)
            {
                const dx  = wp.x - prev.x
                const dy  = wp.y - prev.y
                const len = Math.sqrt(dx * dx + dy * dy)

                // Skip if wheel hasn't moved or teleported (respawn)
                if(len > 0.01 && len < 1.5)
                {
                    const nx = -dy / len
                    const ny =  dx / len

                    this._pushQuad(
                        prev.x - nx * MARK_HALF_W, prev.y - ny * MARK_HALF_W, MARK_Z,
                        prev.x + nx * MARK_HALF_W, prev.y + ny * MARK_HALF_W, MARK_Z,
                        wp.x   - nx * MARK_HALF_W, wp.y   - ny * MARK_HALF_W, MARK_Z,
                        wp.x   + nx * MARK_HALF_W, wp.y   + ny * MARK_HALF_W, MARK_Z,
                    )
                }
            }

            this._prevPos[wi - 2] = skidding
                ? { x: wp.x, y: wp.y }
                : null
        }
    }

    _pushQuad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz)
    {
        const STRIDE = 18  // 6 vertices × 3 coords

        if(this._quadCnt >= MAX_QUADS)
        {
            // Discard the oldest quad by shifting buffer left
            this._posArr.copyWithin(0, STRIDE)
            this._quadCnt = MAX_QUADS - 1
        }

        const base = this._quadCnt * STRIDE

        // Triangle 1: a, b, c
        this._posArr[base +  0] = ax; this._posArr[base +  1] = ay; this._posArr[base +  2] = az
        this._posArr[base +  3] = bx; this._posArr[base +  4] = by; this._posArr[base +  5] = bz
        this._posArr[base +  6] = cx; this._posArr[base +  7] = cy; this._posArr[base +  8] = cz
        // Triangle 2: b, d, c
        this._posArr[base +  9] = bx; this._posArr[base + 10] = by; this._posArr[base + 11] = bz
        this._posArr[base + 12] = dx; this._posArr[base + 13] = dy; this._posArr[base + 14] = dz
        this._posArr[base + 15] = cx; this._posArr[base + 16] = cy; this._posArr[base + 17] = cz

        this._quadCnt++
        this._attr.needsUpdate = true
        this._mesh.geometry.setDrawRange(0, this._quadCnt * 6)
    }
}
