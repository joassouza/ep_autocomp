var ep_autocomp_test_helper = ep_autocomp_test_helper || {};
ep_autocomp_test_helper.utils = {
  writeWordsWithC: function(cb){
    var inner$ = helper.padInner$;
    var $firstTextElement = inner$("div").first();
    //select this text element
    $firstTextElement.sendkeys('{selectall}{del}');
    $firstTextElement.html('car<br/>chrome<br/>couch<br/>&nbsp;<br/>');
    helper.waitFor(function(){
      var $firstTextElement =  inner$("div").first();
      return $firstTextElement.text() === "car";
    }).done(cb);
  },

  // force pad content to be empty, so tests won't fail if Etherpad default text
  // has content on settings.json
  clearPad: function(cb) {
    var inner$ = helper.padInner$;
    var $padContent = inner$("#innerdocbody");
    $padContent.html("");

    // wait for Etherpad to re-create first line
    helper.waitFor(function(){
      var lineNumber = inner$("div").length;
      return lineNumber === 1;
    }).done(cb);
  },

  resetFlagsAndEnableAutocomplete: function(callback) {
    this.resetFlags();
    this.enableAutocomplete(callback);
  },

  enableAutocomplete: function(callback) {
    var chrome$ = helper.padChrome$;

    //click on the settings button to make settings visible
    var $settingsButton = chrome$(".buttonicon-settings");
    $settingsButton.click();

    //check "enable autocompletion"
    var $autoComplete = chrome$('#options-autocomp')
    if (!$autoComplete.is(':checked')) $autoComplete.click();

    // hide settings again
    $settingsButton.click();

    callback();
  },

  // reset flags to avoid eventual conflicts with other plugins extending ep_autocomp
  resetFlags: function(){
    var autocomp = helper.padChrome$.window.autocomp;
    autocomp.processKeyEvent = true;
    autocomp.processEditEvent = true;
    autocomp.showOnEmptyWords = false;
    return;
  },
};