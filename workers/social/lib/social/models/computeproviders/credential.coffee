
jraphical       = require 'jraphical'
JCredentialData = require './credentialdata'

module.exports = class JCredential extends jraphical.Module

  KodingError        = require '../../error'

  {secure, ObjectId, signature} = require 'bongo'
  {Relationship}     = jraphical
  {permit}           = require '../group/permissionset'
  Validators         = require '../group/validators'

  @trait __dirname, '../../traits/protected'

  @share()

  @set

    softDelete        : yes

    permissions       :
      'create credential' : ['member']
      'update credential' : ['member']
      'get credential'    : ['member']
      'delete credential' : ['member']

    sharedMethods     :
      static          :
        one           :
          (signature String, Function)
        create        :
          (signature Object, Function)
        # all           :
        #   (signature Function)
      instance        :
        delete        :
          (signature Function)
        # assign        :
        #   (signature Object, Function)
        # unassign      :
        #   (signature Object, Function)
        # update        :
        #   (signature Object, Function)

    sharedEvents      :
      static          : [ ]
      instance        : [
        { name : 'updateInstance' }
      ]

    indexes           :
      publicKey       : 'unique'

    schema            :

      vendor          :
        type          : String
        required      : yes

      title           :
        type          : String
        required      : yes

      publicKey       :
        type          : String
        required      : yes

    relationships     :

      data            :
        targetType    : "JCredentialData"
        as            : "data"

  failed = (err, callback, rest...)->
    return false  unless err

    if rest
      obj.remove?()  for obj in rest

    callback err
    return true

  @create = permit 'create credential',

    success: (client, data, callback)->

      {delegate} = client.connection
      {vendor, title, meta} = data

      credData = new JCredentialData { meta }
      credData.save (err)->
        return  if failed err, callback

        {publicKey} = credData
        credential = new JCredential { vendor, title, publicKey }

        credential.save (err)->
          return  if failed err, callback, credData

          delegate.addCredential credential, as: "user"
          delegate.addCredential credential, as: "owner", (err)->
            return  if failed err, callback, credential, credData

            credential.addData credData, (err)->
              return  if failed err, callback, credential, credData
              callback null, credential

  delete: permit

    advanced: [
      { permission: 'delete credential', validateWith: Validators.own }
    ]

    success: (client, callback)->

      @remove callback
