class TerminalPane extends Pane

  constructor: (options = {}, data) ->

    options.cssClass = "terminal-pane"

    super options, data

    @webterm           = new WebTermView
      delegate         : @
      cssClass         : "webterm"
      advancedSettings : no

    @webterm.on "WebTermConnected", (@remote)=>
      {command} = @getProperties()
      @runCommand command if command
      @webterm.terminal.setScrollbackLimit 50

    @on "PaneResized", @bound "forceResize"

  runCommand: (command) ->
    return unless command
    return @remote.input "#{command}\n"  if @remote

    if not @remote and not @triedAgain
      @utils.wait 2000, =>
        @runCommand command
        @triedAgain = yes

  viewAppended: ->
    super
    @forceResize()

  forceResize: ->
    # TODO: fatihacet - temp fix, 37 is the height of top header bar.
    # I need to set split view's height as its normal height - 37.
    # It will be fixed, when I am done with KDSplitComboView.
    @setHeight @parent.getHeight() - 37

  pistachio: ->
    """
      {{> @header}}
      {{> @webterm}}
    """