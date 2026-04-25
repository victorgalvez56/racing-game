import * as THREE from 'three'
import Materials from './Materials.js'
import Floor from './Floor.js'
import Shadows from './Shadows.js'
import Physics from './Physics.js'
import Objects from './Objects.js'
import Car from './Car.js'
import Areas from './Areas.js'
import Controls from './Controls.js'
import Sounds from './Sounds.js'
import RemoteCarManager from './RemoteCarManager.js'
import Minimap from './Minimap.js'
import Track from './Track.js'
import gsap from 'gsap'
import ControlsOverlay from '../ControlsOverlay.js'
import LapTimer from '../LapTimer.js'
import HUD from '../HUD.js'
import SkidMarks from './SkidMarks.js'
import Environment from './Environment.js'
import SmokeParticles from './SmokeParticles.js'
import GhostLap from './GhostLap.js'
import BoostPads from './BoostPads.js'

export default class World
{
    constructor(_options)
    {
        this.config    = _options.config
        this.debug     = _options.debug
        this.resources = _options.resources
        this.time      = _options.time
        this.sizes     = _options.sizes
        this.camera    = _options.camera
        this.scene     = _options.scene
        this.renderer  = _options.renderer
        this.passes    = _options.passes
        this.network   = _options.network || null

        if(this.debug)
        {
            this.debugFolder = this.debug.addFolder('world')
            this.debugFolder.open()
        }

        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        this.setSounds()
        this.setControls()
        this.setFloor()
        this.setAreas()
        this.setRemoteCars()
        this.setStartingScreen()
    }

    // Called by Application when resources finish loading
    onResourcesReady()
    {
        this._resourcesReady = true
        this._tryStart()
    }

    // Called by Application (via LobbyUI callback) when solo mode lobby is submitted
    onSoloJoin()
    {
        this._playerJoined = true
        this._tryStart()
    }

    start()
    {
        window.setTimeout(() => { this.camera.pan.enable() }, 2000)

        this.setReveal()
        this.setMaterials()
        this.setShadows()
        this.setPhysics()
        this.setTrack()
        if(this.network) this._setupSnapshotSender()
        if(this.network) this._setupBumpHandling()
        this.setObjects()
        this.setCar()
        this.areas.car = this.car
        this._setupYouLabel()
        this.setMinimap()
        this.setLapTimer()
        this.setHUD()
        this.setSkidMarks()
        this.setSmokeParticles()
        this.setGhostLap()
        this.setBoostPads()
        this.setEnvironment()
        this._setupOffTrackDetection()
        this._setupWrongWayDetection()
        this._setupRespawnFeedback()
        this._setupMuteButton()
        this._setupCameraEffects()
    }

    setReveal()
    {
        this.reveal = {}
        this.reveal.matcapsProgress = 0
        this.reveal.floorShadowsProgress = 0
        this.reveal.previousMatcapsProgress = null
        this.reveal.previousFloorShadowsProgress = null

        this.reveal.go = () =>
        {
            gsap.fromTo(this.reveal, { matcapsProgress: 0 }, { matcapsProgress: 1, duration: 3 })
            gsap.fromTo(this.reveal, { floorShadowsProgress: 0 }, { floorShadowsProgress: 1, duration: 3, delay: 0.5 })
            gsap.fromTo(this.shadows, { alpha: 0 }, { alpha: 0.5, duration: 3, delay: 0.5 })

            const spawn = this._serverSpawnPos || { x: 5, y: -35 }
            this.physics.car.chassis.body.sleep()
            this.physics.car.chassis.body.position.set(spawn.x, spawn.y, 12)
            this.physics.car.chassis.body.quaternion.set(0, 0, 0, 1)

            window.setTimeout(() =>
            {
                this.physics.car.chassis.body.wakeUp()
                if(this.network) this.network.playerReady()
            }, 300)

            gsap.fromTo(this.sounds.engine.volume, { master: 0 }, { master: 0.7, duration: 0.5, delay: 0.3, ease: 'power2.in' })
            window.setTimeout(() => { this.sounds.play('reveal') }, 400)

            if(this.controls.touch)
            {
                window.setTimeout(() => { this.controls.touch.reveal() }, 400)
            }

            if(!this.controls.touch)
            {
                const overlay = new ControlsOverlay()
                window.setTimeout(() => overlay.show(), 1500)
            }

            // Start lights then start lap timer
            window.setTimeout(() => this._showCountdown(), 800)
        }

        this.time.on('tick', () =>
        {
            if(this.reveal.matcapsProgress !== this.reveal.previousMatcapsProgress)
            {
                for(const _materialKey in this.materials.shades.items)
                {
                    this.materials.shades.items[_materialKey].uniforms.uRevealProgress.value = this.reveal.matcapsProgress
                }
                this.reveal.previousMatcapsProgress = this.reveal.matcapsProgress
            }

            if(this.reveal.floorShadowsProgress !== this.reveal.previousFloorShadowsProgress)
            {
                for(const _mesh of this.objects.floorShadows)
                {
                    _mesh.material.uniforms.uAlpha.value = this.reveal.floorShadowsProgress
                }
                this.reveal.previousFloorShadowsProgress = this.reveal.floorShadowsProgress
            }
        })
    }

    setStartingScreen()
    {
        this._resourcesReady = false
        this._playerJoined   = false

        // In solo mode, resources ready is the only gate (player "joins" via lobby submit)
        // In multiplayer, we also wait for room:joined (handled in setRemoteCars)

        this._tryStart = () =>
        {
            if(!this._resourcesReady || !this._playerJoined) return
            this._tryStart = () => {}  // prevent double-start
            this.start()
            window.setTimeout(() => { this.reveal.go() }, 600)
        }
    }

    setSounds()
    {
        this.sounds = new Sounds({ debug: this.debugFolder, time: this.time })
    }

    setControls()
    {
        this.controls = new Controls({
            config: this.config,
            sizes:  this.sizes,
            time:   this.time,
            camera: this.camera,
            sounds: this.sounds
        })
    }

    setMaterials()
    {
        this.materials = new Materials({ resources: this.resources, debug: this.debugFolder })
    }

    setFloor()
    {
        this.floor = new Floor({ debug: this.debugFolder })
        this.container.add(this.floor.container)
    }

    setShadows()
    {
        this.shadows = new Shadows({
            time:     this.time,
            debug:    this.debugFolder,
            renderer: this.renderer,
            camera:   this.camera
        })
        this.container.add(this.shadows.container)
    }

    setPhysics()
    {
        this.physics = new Physics({
            config:   this.config,
            debug:    this.debug,
            scene:    this.scene,
            time:     this.time,
            sizes:    this.sizes,
            controls: this.controls,
            sounds:   this.sounds
        })
        this.container.add(this.physics.models.container)
    }

    setObjects()
    {
        this.objects = new Objects({
            time:      this.time,
            resources: this.resources,
            materials: this.materials,
            physics:   this.physics,
            shadows:   this.shadows,
            sounds:    this.sounds,
            debug:     this.debugFolder
        })
        this.container.add(this.objects.container)
    }

    setCar()
    {
        this.car = new Car({
            time:      this.time,
            resources: this.resources,
            objects:   this.objects,
            physics:   this.physics,
            shadows:   this.shadows,
            materials: this.materials,
            controls:  this.controls,
            sounds:    this.sounds,
            renderer:  this.renderer,
            camera:    this.camera,
            debug:     this.debugFolder,
            config:    this.config,
            carColor:  this.config.carColor ?? 0
        })
        this.container.add(this.car.container)
    }

    setAreas()
    {
        this.areas = new Areas({
            config:    this.config,
            resources: this.resources,
            debug:     this.debug,
            renderer:  this.renderer,
            camera:    this.camera,
            car:       this.car,
            sounds:    this.sounds,
            time:      this.time
        })
        this.container.add(this.areas.container)
    }

    setTrack()
    {
        this.track = new Track({
            world:         this.physics.world,
            floorMaterial: this.physics.materials.items.floor,
            resources:     this.resources,
        })
        this.container.add(this.track.container)
    }

    setLapTimer()
    {
        this.lapTimer = new LapTimer()

        if(this.track?.gateOrigin && this.track?.gateDir)
        {
            this.lapTimer.setGate(this.track.gateOrigin, this.track.gateDir)
        }

        // Add two sector checkpoints at ~33% and ~67% of the centerline
        const center = this.track?.centerPath
        if(center && center.length >= 3)
        {
            const N = center.length

            // Sector 1 gate: ~33% mark
            const i1    = Math.floor(N * 0.33)
            const prev1 = center[(i1 - 1 + N) % N]
            const next1 = center[(i1 + 1) % N]
            const dx1   = next1.x - prev1.x
            const dy1   = next1.y - prev1.y
            const l1    = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1
            this.lapTimer.addSector({ x: center[i1].x, y: center[i1].y }, { x: dx1 / l1, y: dy1 / l1 })

            // Sector 2 gate: ~67% mark
            const i2    = Math.floor(N * 0.67)
            const prev2 = center[(i2 - 1 + N) % N]
            const next2 = center[(i2 + 1) % N]
            const dx2   = next2.x - prev2.x
            const dy2   = next2.y - prev2.y
            const l2    = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1
            this.lapTimer.addSector({ x: center[i2].x, y: center[i2].y }, { x: dx2 / l2, y: dy2 / l2 })
        }

        this.lapTimer.on('sector', () =>
        {
            this.sounds?.play('uiArea', 0)
        })

        this.time.on('tick', () =>
        {
            if(this.physics && this.lapTimer._active)
            {
                this.lapTimer.tick(this.physics.car.chassis.body)
            }
        })
    }

    setHUD()
    {
        this.hud = new HUD({
            lapTimer: this.lapTimer,
            physics:  this.physics,
        })

        this.time.on('tick', () =>
        {
            if(this.hud && this.lapTimer._active)
            {
                this.hud.update()
            }
        })
    }

    setMinimap()
    {
        const $map = document.getElementById('mp-minimap')
        if($map) $map.style.display = 'block'

        this.minimap = new Minimap({
            physics:          this.physics,
            remoteCarManager: this.remoteCarManager || null,
            network:          this.network,
            localCarColor:    this.config.carColor ?? 0,
            trackOuter:       this.track?.outerPath  || null,
            trackInner:       this.track?.innerPath  || null,
            centerPath:       this.track?.centerPath || null,
        })

        this.time.on('tick', () => { this.minimap.update() })
    }

    setRemoteCars()
    {
        if(!this.network) return

        this.controls.network = this.network

        this._serverSpawnPos = null
        this.network.on('room:joined', ({ spawnPos }) =>
        {
            this._serverSpawnPos = spawnPos
            this._playerJoined = true
            this._tryStart?.()
        })

        this.remoteCarManager = new RemoteCarManager({
            scene:           this.scene,
            resources:       this.resources,
            network:         this.network,
            camera:          this.camera,
            sizes:           this.sizes,
            getPhysicsWorld: () => this.physics?.world,
        })

        this.time.on('tick', () => { this.remoteCarManager.update() })
    }

    _setupSnapshotSender()
    {
        let _lastSend = 0
        this.time.on('tick', () =>
        {
            if(!this.network || !this.physics) return
            const now = Date.now()
            if(now - _lastSend < 50) return
            _lastSend = now

            const body  = this.physics.car.chassis.body
            const infos = this.physics.car.vehicle.wheelInfos

            const wheels = infos.map(w => ({
                pos:  [w.worldTransform.position.x,   w.worldTransform.position.y,   w.worldTransform.position.z],
                quat: [w.worldTransform.quaternion.x, w.worldTransform.quaternion.y, w.worldTransform.quaternion.z, w.worldTransform.quaternion.w],
            }))

            this.network.sendSnapshot({
                pos:    [body.position.x,        body.position.y,        body.position.z],
                quat:   [body.quaternion.x,      body.quaternion.y,      body.quaternion.z,      body.quaternion.w],
                vel:    [body.velocity.x,        body.velocity.y,        body.velocity.z],
                angVel: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
                wheels,
            })
        })
    }

    _setupBumpHandling()
    {
        this.physics.car.onBump = (targetId, fromPos) =>
        {
            this.network.sendBump(targetId, fromPos)
            this._shakeCamera()
        }

        this.network.on('player:bumped', ({ fromPos }) =>
        {
            this.physics.car.receiveBump(fromPos)
            this.sounds.play('carHit', 10)
            this._shakeCamera()
        })
    }

    _shakeCamera()
    {
        const canvas = document.querySelector('canvas')
        if(!canvas) return
        canvas.style.transition = 'none'
        canvas.style.transform  = `translate(${(Math.random() - 0.5) * 10}px, ${(Math.random() - 0.5) * 10}px) rotate(${(Math.random() - 0.5) * 0.6}deg)`
        requestAnimationFrame(() =>
        {
            canvas.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            canvas.style.transform  = 'translate(0, 0) rotate(0deg)'
        })
    }

    _setupYouLabel()
    {
        const $you = document.getElementById('mp-you')
        if(!$you) return

        $you.textContent   = this.network?.localPlayerName || this.config.playerName || 'YOU'
        $you.style.display = 'block'

        this.time.on('tick', () =>
        {
            if(!this.car?.chassis?.object) return

            const worldPos = this.car.chassis.object.position.clone()
            worldPos.z    += 1.5
            const projected = worldPos.project(this.camera.instance)

            if(projected.z > 1) { $you.style.display = 'none'; return }

            const x = (projected.x *  0.5 + 0.5) * this.sizes.viewport.width
            const y = (projected.y * -0.5 + 0.5) * this.sizes.viewport.height
            $you.style.display = 'block'
            $you.style.left    = `${x}px`
            $you.style.top     = `${y}px`
        })
    }

    setSkidMarks()
    {
        this.skidMarks = new SkidMarks({ physics: this.physics })
        this.container.add(this.skidMarks.container)
        this.time.on('tick', () => { this.skidMarks.update() })
    }

    setSmokeParticles()
    {
        this.smokeParticles = new SmokeParticles({ physics: this.physics, time: this.time })
        this.scene.add(this.smokeParticles.container)
        this.time.on('tick', () => { this.smokeParticles.update() })
    }

    setGhostLap()
    {
        this.ghostLap = new GhostLap({
            physics:  this.physics,
            time:     this.time,
            lapTimer: this.lapTimer,
        })
        this.scene.add(this.ghostLap._container)
        this.time.on('tick', () => { this.ghostLap.update() })
    }

    setBoostPads()
    {
        this.boostPads = new BoostPads({
            physics:  this.physics,
            time:     this.time,
            onBoost:  () => this.hud?.showBoost(),
        })
        this.container.add(this.boostPads.container)
        this.time.on('tick', () => { this.boostPads.update() })
        if(this.minimap) this.minimap.boostPads = this.boostPads._pads.map(p => ({ x: p.x, y: p.y }))
    }

    _setupRespawnFeedback()
    {
        const $flash = document.getElementById('respawn-flash')

        this.controls.on('action', (name) =>
        {
            if(name !== 'reset' || !$flash) return
            $flash.style.animation = 'none'
            void $flash.offsetWidth
            $flash.style.animation = 'respawn-flash 0.5s ease-out forwards'
            this._shakeCamera()
        })
    }

    setEnvironment()
    {
        this.environment = new Environment({
            resources: this.resources,
            renderer:  this.renderer,
        })
        this.container.add(this.environment.container)
    }

    _setupCameraEffects()
    {
        const FOV_BASE  = 40
        const FOV_MAX   = 58
        const FOV_EASE  = 0.05

        let fovCurrent  = FOV_BASE

        const LOOK_MAX  = 4.0   // max look-ahead offset (world units)
        const LOOK_EASE = 0.07

        let lx = 0, ly = 0     // current eased look-ahead offset

        this.time.on('tick', () =>
        {
            if(!this.car?.chassis?.object) return

            const carPos = this.car.chassis.object.position

            // Speed-based FOV
            const vel   = this.physics.car.chassis.body.velocity
            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2)
            const norm  = Math.min(speed / 22, 1)

            fovCurrent += (THREE.MathUtils.lerp(FOV_BASE, FOV_MAX, norm) - fovCurrent) * FOV_EASE
            this.camera.instance.fov = fovCurrent
            this.camera.instance.updateProjectionMatrix()

            // Steering look-ahead: project a bit in the car's lateral direction
            const quat  = this.physics.car.chassis.body.quaternion
            const hx    =  1 - 2 * (quat.y * quat.y + quat.z * quat.z)
            const hy    =  2 * (quat.x * quat.y + quat.z * quat.w)
            // Car's right direction: (hy, -hx) in XY plane
            const steer = (this.controls.actions.right ? 1 : 0) - (this.controls.actions.left ? 1 : 0)
            const ahead = norm * steer * LOOK_MAX

            const txTarget = carPos.x + hy  * ahead
            const tyTarget = carPos.y - hx  * ahead

            lx += (txTarget - lx) * LOOK_EASE
            ly += (tyTarget - ly) * LOOK_EASE

            this.camera.target.x = lx
            this.camera.target.y = ly
        })
    }

    _setupOffTrackDetection()
    {
        const center = this.track.centerPath
        if(!center || center.length === 0) return

        const HALF_WIDTH   = 7       // track half-width (14m / 2)
        const BUFFER       = 2.5     // extra margin before drag starts
        const THRESHOLD_SQ = (HALF_WIDTH + BUFFER) ** 2

        const $note  = document.getElementById('hud-lap-note')
        let offTrack = false
        let noteShown = false

        this.time.on('tick', () =>
        {
            if(!this.lapTimer?._active || !this.physics) return

            const body = this.physics.car.chassis.body
            const px   = body.position.x
            const py   = body.position.y

            // Find closest centerline point
            let minSq  = Infinity
            for(const pt of center)
            {
                const dx = pt.x - px
                const dy = pt.y - py
                const sq = dx * dx + dy * dy
                if(sq < minSq) minSq = sq
            }

            const wasOff = offTrack
            offTrack = minSq > THRESHOLD_SQ

            if(offTrack)
            {
                const dt     = Math.min(this.time.delta, 60)
                // Halve speed every 2 seconds off-track
                const factor = Math.pow(0.5, dt / 2000)
                body.velocity.x *= factor
                body.velocity.y *= factor
            }

            // Show/hide "OFF TRACK" note
            if(offTrack && !wasOff && $note)
            {
                $note.textContent   = '⚠ OFF TRACK'
                $note.style.color   = '#e67e22'
                $note.style.opacity = '1'
                noteShown = true
            }
            else if(!offTrack && wasOff && noteShown && $note)
            {
                $note.style.opacity = '0'
                noteShown = false
            }
        })
    }

    _setupWrongWayDetection()
    {
        const center = this.track.centerPath
        if(!center || center.length === 0) return

        const $el = document.getElementById('wrong-way')
        if(!$el) return

        let score = 0   // accumulated "wrongness" ms — show indicator above threshold

        this.time.on('tick', () =>
        {
            if(!this.lapTimer?._active || !this.physics) return

            const dt   = Math.min(this.time.delta, 60)
            const body = this.physics.car.chassis.body
            const vel  = body.velocity
            const px   = body.position.x
            const py   = body.position.y

            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
            if(speed < 3)
            {
                score = Math.max(score - dt * 3, 0)
            }
            else
            {
                // Find closest centerline point and its tangent
                let minSq  = Infinity
                let minIdx = 0
                for(let i = 0; i < center.length; i++)
                {
                    const dx = center[i].x - px
                    const dy = center[i].y - py
                    const sq = dx * dx + dy * dy
                    if(sq < minSq) { minSq = sq; minIdx = i }
                }
                const N    = center.length
                const prev = center[(minIdx - 1 + N) % N]
                const next = center[(minIdx + 1)     % N]
                const tx   = next.x - prev.x
                const ty   = next.y - prev.y
                const tlen = Math.sqrt(tx * tx + ty * ty) || 1

                const dotVelTrack = (vel.x * tx + vel.y * ty) / (speed * tlen)

                if(dotVelTrack < -0.65)
                    score = Math.min(score + dt, 1500)
                else
                    score = Math.max(score - dt * 2, 0)
            }

            $el.style.display = score > 900 ? 'block' : 'none'
        })
    }

    _setupMuteButton()
    {
        const $btn = document.getElementById('btn-mute')
        if(!$btn) return
        $btn.style.display = 'flex'
        $btn.textContent   = this.sounds.isMuted() ? '🔇' : '🔊'
        $btn.addEventListener('click', () =>
        {
            this.sounds.toggleMute()
            $btn.textContent = this.sounds.isMuted() ? '🔇' : '🔊'
        })
    }

    _showCountdown()
    {
        const $overlay = document.getElementById('start-lights-overlay')
        const pods     = [0, 1, 2, 3, 4].map(i => document.getElementById(`sl-${i}`))
        if(!$overlay || pods.some(p => !p)) return

        $overlay.style.display    = 'block'
        $overlay.style.animation  = ''
        $overlay.style.opacity    = '1'
        pods.forEach(p => p.className = 'sl-pod')

        // Light each pod red 600ms apart
        pods.forEach((pod, i) =>
        {
            setTimeout(() => pod.classList.add('red'), i * 600)
        })

        // After all are red, hold briefly then go green and fade
        const allRedAt = pods.length * 600
        setTimeout(() =>
        {
            pods.forEach(p => { p.classList.remove('red'); p.classList.add('green') })

            setTimeout(() =>
            {
                $overlay.style.animation = 'sl-fade 0.55s ease-out forwards'
                setTimeout(() =>
                {
                    $overlay.style.display = 'none'
                    pods.forEach(p => p.className = 'sl-pod')
                    if(this.lapTimer)  this.lapTimer.start()
                    if(this.hud)       this.hud.show()
                    if(this.ghostLap)  this.ghostLap.begin()
                }, 560)
            }, 600)
        }, allRedAt + 400)
    }
}
