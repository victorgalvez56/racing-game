import { io } from 'socket.io-client'
import EventEmitter from './Utils/EventEmitter.js'

export default class Network extends EventEmitter
{
    constructor()
    {
        super()

        this.socket   = null
        this.localId  = null
        this.latency  = 0
        this.serverTimeOffset = 0     // serverTime ≈ Date.now() + offset
        this._pingInterval = null
    }

    // Returns the current server clock estimate (used for interpolation
    // timing so clients pin to the same temporal reference)
    serverNow()
    {
        return Date.now() + this.serverTimeOffset
    }

    connect(serverUrl = '/')
    {
        this.socket = io(serverUrl, { autoConnect: true })

        this.socket.on('connect', () =>
        {
            console.log('[network] connected id=', this.socket.id)
            this.trigger('connected')

            // If we were previously joined to a room and just reconnected
            // (server removed us on disconnect), automatically re-emit the
            // join so we land back in the game without bouncing through the
            // lobby UI again.
            if(this._wasJoined)
            {
                this.socket.emit('player:join', this._lastJoinPayload)
            }
        })

        this.socket.on('disconnect', () =>
        {
            console.warn('[network] disconnected')
            this.trigger('disconnected')
        })

        this.socket.on('room:joined', ({ id, existingPlayers, spawnPos }) =>
        {
            console.log('[network] room:joined — my id=', id, 'existing=', existingPlayers, 'spawnPos=', spawnPos)
            this.localId  = id
            this.spawnPos = spawnPos   // { x, y } — used by World to position local car
            this.trigger('room:joined', [{ id, existingPlayers, spawnPos }])
        })

        this.socket.on('room:full', () =>
        {
            this.trigger('room:full')
        })

        this.socket.on('player:joined', (data) =>
        {
            console.log('[network] player:joined —', data)
            this.trigger('player:joined', [data])
        })

        this.socket.on('player:left', (data) =>
        {
            this.trigger('player:left', [data])
        })

        this.socket.on('world:snapshot', (snapshot) =>
        {
            // Log first snapshot only
            if(!this._snapshotLogged)
            {
                this._snapshotLogged = true
                console.log('[network] first world:snapshot — cars:', snapshot.cars?.length, snapshot.cars?.map(c => c.id))
            }
            this.trigger('world:snapshot', [snapshot])
        })

        this.socket.on('player:bumped', (data) =>
        {
            this.trigger('player:bumped', [data])
        })

        this.socket.on('chat:message', (data) =>
        {
            this.trigger('chat:message', [data])
        })

        this.socket.on('combat:missile', (data) =>
        {
            console.log('[net] ← combat:missile received', data)
            this.trigger('combat:missile', [data])
        })

        this.socket.on('player:combatDamage', (data) =>
        {
            console.log('[net] ← player:combatDamage received', data)
            this.trigger('player:combatDamage', [data])
        })

        this.socket.on('combat:explosion', (data) =>
        {
            console.log('[net] ← combat:explosion received', data)
            this.trigger('combat:explosion', [data])
        })

        this.socket.on('combat:carDestroyed', (data) =>
        {
            console.log('[net] ← combat:carDestroyed received', data)
            this.trigger('combat:carDestroyed', [data])
        })

        this.socket.on('combat:meteor', (data) =>
        {
            this.trigger('combat:meteor', [data])
        })

        // Latency + clock-sync. Server returns its Date.now() in the ping
        // callback; we compute (serverTime + halfRTT) - clientTime to get
        // an offset that lets clients align interpolation to a shared clock.
        this._pingInterval = setInterval(() =>
        {
            const start = Date.now()
            this.socket.emit('ping', (serverTime) =>
            {
                const rtt = Date.now() - start
                this.latency = rtt
                if(typeof serverTime === 'number')
                {
                    // Smoothed offset (low-pass) so single jitter doesn't
                    // jolt the timeline. First sample sets it directly.
                    const sampled = (serverTime + rtt / 2) - Date.now()
                    if(this._offsetInitialized)
                        this.serverTimeOffset = this.serverTimeOffset * 0.7 + sampled * 0.3
                    else
                    {
                        this.serverTimeOffset = sampled
                        this._offsetInitialized = true
                    }
                }
                this.trigger('ping', [this.latency])
            })
        }, 1500)
    }

    join(name, carColor, carType = 'default')
    {
        this.localPlayerName = name
        this._wasJoined        = true
        this._lastJoinPayload  = { name, carColor, carType }
        this.socket.emit('player:join', this._lastJoinPayload)
    }

    sendInput(actions)
    {
        // Only emit — no return value needed
        this.socket.emit('player:input', actions)
    }

    sendSnapshot(state)
    {
        // Send our own physics state so server can relay it to remote players
        this.socket.emit('player:snapshot', state)
    }

    sendBump(targetId, fromPos)
    {
        this.socket.emit('player:bump', { targetId, fromPos })
    }

    sendChat(text)
    {
        this.socket.emit('chat:message', { text })
    }

    sendMissileFired(x, y, z, dx, dy)
    {
        console.log('[net] → combat:missile sent', { x, y, z, dx, dy })
        this.socket.emit('combat:missile', { x, y, z, dx, dy })
    }

    sendCombatDamage(targetId, amount)
    {
        this.socket.emit('player:combatDamage', { targetId, amount })
    }

    sendExplosion(x, y, z)
    {
        this.socket.emit('combat:explosion', { x, y, z })
    }

    sendCarDestroyed(x, y, z, vx, vy, color)
    {
        this.socket.emit('combat:carDestroyed', { x, y, z, vx, vy, color })
    }

    playerReady()
    {
        // Called when the local car wakes up (reveal.go setTimeout fires)
        // Server resets its car to the same spawn position so both fall simultaneously
        this.socket.emit('player:ready')
    }

    disconnect()
    {
        clearInterval(this._pingInterval)
        this.socket?.disconnect()
    }
}
