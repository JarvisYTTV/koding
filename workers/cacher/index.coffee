{argv}   = require 'optimist'
Bongo    = require 'bongo'
KONFIG   = require('koding-config-manager').load("main.#{argv.c}")
Broker   = require 'broker'
{extend} = require 'underscore'

{mongo, cacheWorker, mq} = KONFIG

mongo += '?auto_reconnect'

mqOptions = extend {}, mq
# mqOptions.login = cacheWorker.login if cacheWorker?.login?

koding = new Bongo {
  mongo
  root         : __dirname
  mq           : new Broker mqOptions
  resourceName : cacheWorker.queueName
  models       : '../social/lib/social/models'
}

{JActivityCache, CActivity} = koding.models

do ->

  typesToBeCached = [
      'CStatusActivity'
      'CCodeSnipActivity'
      'CFollowerBucketActivity'
      'CNewMemberBucketActivity'
      'CDiscussionActivity'
      'CTutorialActivity'
      'CInstallerBucketActivity'
    ]

  cachingInProgress = no

  koding.connect ->
    # TODO: this is an ugly hack.  I just want it to work for now :/
    emitter = new (require('events').EventEmitter)
    JActivityCache.on "CachingFinished", -> cachingInProgress = no

    {connection} = koding.mq

    connection.exchange 'broker', {type:'topic', autoDelete:yes}, (exchange)->
      connection.queue '', {exclusive: yes, autoDelete: yes}, (queue)->
        queue.bind exchange, 'constructor.CActivity.event.#'
        queue.on 'queueBindOk', ->
          queue.subscribe (message, headers, deliveryInfo)->
            eventName = deliveryInfo.routingKey.split('.').pop()
            payload = koding.revive message
            payload = [payload]  unless Array.isArray payload
            emitter.emit eventName, payload...


    emitter.on "ActivityIsCreated", (activity)->
      if not cachingInProgress\
         and activity.constructor.name in typesToBeCached
        cachingInProgress = yes
        JActivityCache.init()

    emitter.on "post-updated",  JActivityCache.modifyByTeaser.bind JActivityCache
    emitter.on "PostIsDeleted", JActivityCache.removeActivity.bind JActivityCache

    emitter.on "BucketIsUpdated", (bucketOptions)->
      {type, teaserId, createdAt} = bucketOptions
      if type in typesToBeCached
        JActivityCache.modifyByTeaser {teaserId, createdAt}

    console.log "Activity Cache Worker is ready."

    JActivityCache.init()
