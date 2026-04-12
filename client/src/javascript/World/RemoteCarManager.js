import * as THREE from 'three'
import RemoteCar from './RemoteCar.js'

export default class RemoteCarManager
{
    constructor(_options)
    {
        this.scene            = _options.scene
        this.resources        = _options.resources
        this.network          = _options.network
        this.camera           = _options.camera
        this.sizes            = _options.sizes
        this.getPhysicsWorld  = _options.getPhysicsWorld  // () => CANNON.World | null

        this.cars     = new Map()  // id → RemoteCar
        this._pending = []         // players queued before resources are ready
        this._ready   = false      // true once resources are loaded

        // Pre-cloned GLTF templates — created before the local Car.js can
        // consume (move) the GLTF scene children via getConvertedMesh().
        this._chassisTemplate = null
        this._wheelTemplate   = null

        // Mark ready once resources finish loading (may already be done)
        if(this.resources.items.carDefaultChassis)
        {
            this._ready = true
            this._buildTemplates()
        }
        else
        {
            this.resources.on('ready', () =>
            {
                this._buildTemplates()
                this._ready = true
                // Flush any players that joined before models were loaded
                for(const p of this._pending)
                {
                    this._createCar(p.id, p.name, p.carColor)
                }
                this._pending = []
            })
        }

        this._setupNetworkEvents()
    }

    // Clone the GLTF scene CHILDREN into a fresh Group — skips the root scene's
    // Y-up correction rotation that GLTF loaders often embed, which would make
    // the car lie flat. Car.js does the same by passing scene.children to
    // getConvertedMesh() and ignoring the root transform.
    _buildTemplates()
    {
        // Simple clone — used for chassis which has no center marker.
        const _cloneChildren = (gltfItem) =>
        {
            const group = new THREE.Group()
            for(const child of gltfItem.scene.children)
            {
                group.add(child.clone(true))
            }
            return group
        }

        // Center-aware clone — matches Objects.getConvertedMesh() centering logic.
        // If the GLTF has a "center" marker object, subtract its position from
        // all mesh children so the group origin becomes the wheel's pivot point.
        // Without this the wheel meshes are offset by their raw GLTF positions.
        const _cloneChildrenCentered = (gltfItem) =>
        {
            const children = gltfItem.scene.children
            const group    = new THREE.Group()

            // Find center marker (same regex as Objects.js)
            let cx = 0, cy = 0, cz = 0
            for(const child of children)
            {
                if(child.name.match(/^center_?[0-9]{0,3}?/i))
                {
                    cx = child.position.x
                    cy = child.position.y
                    cz = child.position.z
                    break
                }
            }

            for(const child of children)
            {
                if(child.name.match(/^center_?[0-9]{0,3}?/i)) continue  // skip marker
                const clone = child.clone(true)
                clone.position.x -= cx
                clone.position.y -= cy
                clone.position.z -= cz
                group.add(clone)
            }

            return group
        }

        this._chassisTemplate = _cloneChildren(this.resources.items.carDefaultChassis)
        this._wheelTemplate   = _cloneChildrenCentered(this.resources.items.carDefaultWheel)
        console.log('[RemoteCarManager] templates built — chassis children:', this._chassisTemplate.children.length, '| wheel children:', this._wheelTemplate.children.length)
    }

    _setupNetworkEvents()
    {
        // New player joins — create their car
        this.network.on('player:joined', ({ id, name, carColor }) =>
        {
            console.log(`[RemoteCarManager] player:joined → name="${name}" id="${id}"`)
            this._addCar(id, name, carColor)
        })

        // Player leaves — destroy their car
        this.network.on('player:left', ({ id }) =>
        {
            this._removeCar(id)
        })

        // Server snapshot — update all remote cars
        this.network.on('world:snapshot', ({ t, cars }) =>
        {
            for(const carState of cars)
            {
                // Skip local player
                if(carState.id === this.network.localId) continue

                const car = this.cars.get(carState.id)
                if(car)
                {
                    car.addSnapshot({ t, ...carState })
                }
                else
                {
                    // Car not created yet — log once per unknown id
                    if(!this._warnedIds) this._warnedIds = new Set()
                    if(!this._warnedIds.has(carState.id))
                    {
                        this._warnedIds.add(carState.id)
                        console.warn(`[RemoteCarManager] snapshot for unknown car "${carState.id}" — car not created yet`)
                    }
                }
            }
        })

        // When we join, add existing players
        this.network.on('room:joined', ({ existingPlayers }) =>
        {
            console.log(`[RemoteCarManager] room:joined → existingPlayers:`, existingPlayers)
            for(const player of existingPlayers)
            {
                this._addCar(player.id, player.name, player.carColor)
            }
        })
    }

    // Public: queue or immediately create
    _addCar(id, name, carColor)
    {
        if(this.cars.has(id)) return
        // Avoid duplicate pending entries
        if(this._pending.some(p => p.id === id)) return

        if(this._ready)
        {
            this._createCar(id, name, carColor)
        }
        else
        {
            // Resources not loaded yet — queue for later
            this._pending.push({ id, name, carColor })
            console.log(`[remote] queued ${name} until resources ready`)
        }
    }

    // Internal: actually create the Three.js car
    _createCar(id, name, carColor)
    {
        if(this.cars.has(id)) return

        const car = new RemoteCar({
            scene:           this.scene,
            resources:       this.resources,
            chassisTemplate: this._chassisTemplate,
            wheelTemplate:   this._wheelTemplate,
            id,
            name,
            carColor,
            getPhysicsWorld: this.getPhysicsWorld,
        })

        this.cars.set(id, car)
        console.log(`[remote] +car ${name} (${id})`)
    }

    _removeCar(id)
    {
        const car = this.cars.get(id)
        if(car)
        {
            car.destroy()
            this.cars.delete(id)
            console.log(`[remote] -car ${id}`)
        }
    }

    get count()
    {
        return this.cars.size
    }

    update()
    {
        for(const car of this.cars.values())
        {
            car.update(this.camera, this.sizes)
        }
    }

    destroy()
    {
        for(const car of this.cars.values())
        {
            car.destroy()
        }
        this.cars.clear()
    }
}
