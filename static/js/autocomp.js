var _ = require('ep_etherpad-lite/static/js/underscore');
var $ = require('ep_etherpad-lite/static/js/rjquery').$; //it rjquery is a bridge in order to make jquery require-able


/*
This must be changed as we want to disable calling the plugin, not showing something.

$('#taglistButton').click(function(){
  $('#taglist').toggle();
});
*/

var $autocomp, $list; //fails if they are not defined here, though they are created in postAceInit.

//todo: change to var autocomp = autocomp ||  {} with following autocomp.… =
//so it would be possible to augment the autocomp object from other hooks without polluting global space too much.

var autocomp = {
  //the following shoould probably be: isActive(true) for enabling, isActive (false) for disabling, isActive() for getting the current state. (closure!)
  //isEnabled: true,//this could be getter/Setter too
  //isShown: false,

  // flags to allow other plugins to avoid this plugin to process ace events
  // processKeyEvent enables events like typing arrow, enter, etc
  processKeyEvent: true,
  // processEditEvent enables events of editing a word
  processEditEvent: true,
  // flag to allow show suggestions even if no word is typed
  showOnEmptyWords: false,
  // flag to consider Latin characters as their non-Latin equivalents
  // (user types "a" and we show suggestions like "ál", "ão", etc.)
  ignoreLatinCharacters: false,
  // flag to keep track of target line even if there is no suggestion for the typed text
  doNotResetTargetLineOnEmptySuggestionList: false,
  // flag to allow show suggestion using shortcut CTRL + SPACE
  enableShowSuggestionWithCtrlAndSpace: true,
  tagetLine: undefined,

  // collection of callbacks to be called after user selects a suggestion from the list
  postSuggestionSelectedCallbacks: {},
  addPostSuggestionSelectedCallback: function(id, callback) {
    this.postSuggestionSelectedCallbacks[id] = callback;
  },
  resetPostSuggestionSelectedCallbacks: function(id) {
    delete this.postSuggestionSelectedCallbacks[id];
  },
  callPostSuggestionSelectedCallbacks: function() {
    _.each(this.postSuggestionSelectedCallbacks, function(callback, id) {
      callback();
    });
  },

  createAutocompHTML: function(filteredSuggestions, caretPosition, partialWord, context){
  /*
  creates the dom element for the menu.

  gets:
  filteredSuggestions: an array containing objects like
    {
      fullText: string containing the full text, e.g. "nightingale"
      complementaryString: string with what is needed to complete the String to be matched e.g is the string to be matches is "nighti", than the complementary String here would be "ngale"
    }
  caretPosition: an getBoundingClientRect() with the properties top and left in pixel.

  returns: ?
  */
    if(!filteredSuggestions || !caretPosition){
      console.log("insufficent attributes");
      return;
    } //precaution

    this.targetLine = context.rep.selEnd[0];

    $list.empty();

    //CREATE DOM ELEMENTS
    var listEntries = [];
    $.each(filteredSuggestions, function(index, suggestion){
      // create a dom element (li) for each suggestion
      var listEntry = $("<li/>",
        {
          "class": "ep_autocomp-listentry",
          "text": suggestion.fullText
        }).data(
          "complementary", suggestion.complementaryString //give the complementary string along.
        ).data(
          "partialWord", partialWord
        );

        // add listener to select suggestion on click
        listEntry.click(function() {
          // replace current selected suggestion with this entry
          $(this).siblings(".selected").removeClass("selected");
          $(this).addClass("selected");

          // replace text with this suggestion
          autocomp.selectSuggestion(context);
        });
      listEntries.push(listEntry);
    }); //end each-function

    // make first suggestion marked as selected
    $(listEntries[0]).addClass("selected");

    // append all list entries holding the suggestions
    $list.append(listEntries);

    // show suggestions next to caret position
    $autocomp
      .show()
      .scrollTop(0) // does not keep previous scroll position
      .css({top: caretPosition.top, left: caretPosition.left});
  },

  aceKeyEvent: function(type, context, cb){
    // ACE event processing disable by other plugins
    if (!autocomp.processKeyEvent) return;
    //precaution
    if(!$autocomp||!context) return;
    //if disabled in settings
    if(!$('#options-autocomp').is(':checked')) return;
    //if not menu not shown, don't prevent defaults

    //if key is ↑ , choose next option, prevent default
    //if key is ↓ , choose next option, prevent default
    //if key is ENTER, read out the complementation, close autocomplete menu and input it at caret. It will reopen tough, if there is still something to complete. No problem, on a " " or any other non completable character and it is gone again.
    var eventProcessed = false;
    if($autocomp.is(":visible")){
      //ENTER PRESSED
      if(this.enterPressed(context.evt)){
        var textReplaced = this.selectSuggestion(context);
        if (textReplaced) {
          context.evt.preventDefault();
          // return value should be true if the event was handled.
          // So we return true which can be returned by the hook itself consequently.
          eventProcessed = true;
        }
      }

      //UP PRESSED
      if(this.upPressed(context.evt)){
        this.moveSelectionUp();
        context.evt.preventDefault();
        eventProcessed = true;
      }
      //DOWN PRESSED
      if(this.downPressed(context.evt)){
        this.moveSelectionDown();
        context.evt.preventDefault();
        eventProcessed = true;
      }
      //ESCAPE PRESSED
      if(this.escPressed(context.evt)){
        this.closeSuggestionBox();
        context.evt.preventDefault();
        eventProcessed = true;
      }
    }

    //SPACE AND CONTROL PRESSED
    if(this.ctrlSpacePressed(context.evt) && autocomp.enableShowSuggestionWithCtrlAndSpace){
      if($autocomp.is(":hidden")){
        this.update(context);
      }else{
        this.closeSuggestionBox();
      }
      eventProcessed = true;
    }

    // did we process the event? If so, prevent default action
    if (eventProcessed) {
      context.evt.preventDefault();
    }

    return eventProcessed;
  },
  enterPressed: function(evt) {
    return evt.type === "keydown" && evt.keyCode === 13;
  },
  upPressed: function(evt) {
    // check for shift to avoid confusing "↑" with "&" (shift+7)
    return evt.type === "keydown" && !evt.shiftKey && evt.keyCode === 38;
  },
  downPressed: function(evt) {
    // check for shift to avoid confusing "↓" with "(" (shift+9)
    return evt.type === "keydown" && !evt.shiftKey && evt.keyCode === 40;
  },
  escPressed: function(evt) {
    return evt.type === "keydown" && evt.keyCode === 27;
  },
  ctrlSpacePressed: function(evt) {
    return evt.type === "keydown" && evt.ctrlKey && evt.keyCode === 32;
  },
  moveSelectionDown:function(){
    //only do it if the selection is not on the last element already
    if(!($list.children().last().hasClass("selected"))){
      //move selected class to next element
      $list.
      children(".selected").
      removeClass("selected").
      next().
      addClass("selected");
      var $selectListItem = $list.children(".selected");
      var elementPaddingTop = this.getIntValueOfCSSProperty($selectListItem, "padding-top");
      // position().top does not consider the element padding.
      var listElementHeight = $selectListItem.position().top + elementPaddingTop;
      var offsetFromContainer = listElementHeight -  $autocomp.height();
      //scroll element into view if needed.
      //calculate offset between lower edge of the container and the position plus padding-top of the element.
      //If the number is positive or zero, the element is not visible.
      if(offsetFromContainer >= 0){
        $autocomp.scrollTop($autocomp.scrollTop() + listElementHeight);
      }

    }
  },
  getIntValueOfCSSProperty: function($element, property){
    var valueString = $element.css(property);
    var valueInt = valueString.replace(/[^-\d\.]/g, '');
    return Number(valueInt);
  },
  moveSelectionUp:function(){
    //only do it if the selection is not on the first element already
    if(!($list.children().first().hasClass("selected"))){
      $list.children(".selected").removeClass("selected").prev().addClass("selected");

      var offsetFromContainer = $list.children(".selected").position().top;
      //if position is negative, element is not (fully visible)
      if(offsetFromContainer< 0){
        //note: scrolls to the top by lowering the number, since e.g. +(-10) will be -10
        $autocomp.scrollTop($autocomp.scrollTop()+offsetFromContainer)
      }

    }
  },
  selectSuggestion:function(context){
    var suggestionFound = false;

    var $selectedSuggestion = $list.children(".selected").eq(0);
    // get the data out of the currently selected element
    var textToInsert = $selectedSuggestion.data("complementary");
    // get the text typed by used before suggestion was selected
    var textAlreadyInserted = $selectedSuggestion.data("partialWord");
    // get the original suggestion
    var suggestionText = $selectedSuggestion.text();

    // the element the caret is in
    var currentLineNode = context.rep.lines.atIndex(context.rep.selEnd[0]).lineNode;

    if(textToInsert !== undefined){
      // register listener to be able to call all callbacks when sendkeys is done
      $(currentLineNode).on("sendkeys", function() {
        // unregister listener to avoid duplicate calls in the future
        $(currentLineNode).off("sendkeys");

        // fix replaced text if necessary (see more details on fixReplacedText())
        autocomp.fixReplacedText(currentLineNode, suggestionText, textToInsert, textAlreadyInserted);

        autocomp.callPostSuggestionSelectedCallbacks();
      });

      // Empty lines always have a <br>, so due to problems with inserting text
      // with sendkeys, in this case, we need to insert the html directly
      var emptyLine = $(currentLineNode).find("br");
      var lineIsEmpty = emptyLine.length;
      if (lineIsEmpty){
        emptyLine.replaceWith("<span>" + textToInsert + "</span>");
        this.adjustCaretPosition(currentLineNode, textToInsert);
      }else{
        // we cannot use sendkeys with currentLineNode (the div whith the full line on editor)
        // because this removes lineAttributes if caret is on beginning of line. To avoid this,
        // we use sendkeys with the specific text node where caret is
        var currentElement = this.getNodeInfoWhereCaretIs(context).node;
        $(currentElement).sendkeys(textToInsert);
      }

      this.closeSuggestionBox();
      suggestionFound = true;
    }
    return suggestionFound;
  },
  adjustCaretPosition:function(currentElement, textToInsert){
    var rightarrows = "";
    for (var i = textToInsert.length - 1; i >= 0; i--) {
      rightarrows += '{rightarrow}';
    };
    $(currentElement).sendkeys(rightarrows);
  },

  // Check if replaced text needs some adjustments. This is necessary when Latin chars
  // are ignored and user typed word prefix without Latin chars, but selected suggestion
  // had them.
  // Ex: user typed "arv" and suggestion was "árvore"
  // If we don't fix the resulting text, it will be "arvore", which is wrong
  fixReplacedText: function(currentElement, selectedSuggestion, textInsertedByPlugin, textInsertedByUser) {
    // only need to fix text if actual text is different from selected suggestion
    var needToFixText = (selectedSuggestion !== (textInsertedByUser + textInsertedByPlugin));

    if (this.ignoreLatinCharacters && needToFixText) {
      var commands = "";

      // move caret to beginning of replaced text (on the example: "a|rvore")
      var fullLength = textInsertedByUser.length + textInsertedByPlugin.length;
      for (var i = 1; i < fullLength; i++) { // "i = 1": if it is 0 caret is moved to "|arvore"
        commands += "{leftarrow}";
      };

      // iterate over each of the chars on the resulting text that was inserted by user
      for (var i = 0; i < textInsertedByUser.length; i++) {
        var expectedChar = selectedSuggestion.charAt(i);
        var actualChar = textInsertedByUser.charAt(i);

        // we only replace char if it is not what was expected
        if (expectedChar !== actualChar) {
          // we need to first add correct char and only then remove the old one
          // to avoid loosing text formatting when replacing the chars

          // insert the correct char (on the example: "aá|rvore")
          commands += expectedChar;
          // remove the previous char (on the example: "|árvore")
          commands += "{leftarrow}{backspace}";
          // place caret on the correct position, that is, after expected char (on the example: "á|rvore")
          commands += "{rightarrow}";
        }

        // move caret to next char (on the example: "ár|vore")
        commands += "{rightarrow}";
      };

      // at this point caret is in the end of text previously inserted by user (on the example: "árv|ore").
      // We need to make sure caret moved to its original position (on the example: "árvore|")
      for (var i = 1; i < textInsertedByPlugin.length; i++) { // "i = 1": if it is 0 caret is moved to "árvore |"
        commands += "{rightarrow}";
      };

      // finally, execute all commands:
      $(currentElement).sendkeys(commands);
    }
  },

  closeSuggestionBox:function(context){
    this.targetLine = undefined;
    if($autocomp){
      $autocomp.hide();
    }
  },
  aceEditEvent:function(type, context, cb){
    // ACE event processing disable by other plugins
    if (!autocomp.processEditEvent) return;
    //if disabled in settings
    if(!$('#options-autocomp').is(':checked')) return;
    autocomp.update(context);
  },
  update:function(context, fixedSuggestions, customRegex, customRegexIndex){
    if(context.rep.selStart === null) return;
    //as edit event is called when anyone edits, we must ensure it is the current user
    if(!autocomp.isEditByMe(context)) return;

    //get the word which is being typed
    var partialWord = this.getCurrentPartialWord(context, customRegex, customRegexIndex);

    //hide suggestions if no word is typed
    var wordIsEmpty = partialWord.length === 0;
    if(!this.showOnEmptyWords && wordIsEmpty){
      this.closeSuggestionBox();
      return;
    }

    suggestions = fixedSuggestions || autocomp.getPossibleSuggestions(context);
    filteredSuggestions = autocomp.filterSuggestionList(partialWord, suggestions);

    if(filteredSuggestions.length===0){
      this.closeSuggestionBox();

      // still keep track of target line if flag is on
      if (this.doNotResetTargetLineOnEmptySuggestionList) {
        this.targetLine = context.rep.selEnd[0];
      }

      return;
    }

    var caretPosition = autocomp.caretPosition(context);
    autocomp.createAutocompHTML(filteredSuggestions, caretPosition, partialWord, context);
  },
  filterSuggestionList:function(partialWord,possibleSuggestions){
    /*
    gets:
    - the string for which we want matches ("partialWord")
    - a list of all completions

    returns: an array with objects containing suggestions as object with
    {
      fullText: string containing the full text, e.g. "nightingale"
      complementaryString: string with what is needed to complete the String to be matched e.g is the string to be matches is "nighti", than the complementary String here would be "ngale"
    }

    */

    //filter it
    var filteredSuggestions=[];
    _.each(possibleSuggestions,function(possibleSuggestion, key, list){
      if(typeof possibleSuggestion !== "string") return; //precaution

      // accept suggestion if user didn't type anything and flag showOnEmptyWords is "on"
      var allowEmptyPartialWord   = (partialWord.length === 0 && autocomp.showOnEmptyWords);
      // does partialWord start at the beginning of possibleSuggestion?
      var isSubtextOfSuggestion   = autocomp.subtextOfSuggestion(possibleSuggestion, partialWord);
      // avoid autocomplete "abc" with "abc"
      var notSameWordOfSuggestion = (possibleSuggestion !== partialWord);

      if((allowEmptyPartialWord || isSubtextOfSuggestion) && notSameWordOfSuggestion){
        var complementaryString = possibleSuggestion.slice(partialWord.length);
        filteredSuggestions.push({
          "fullText":possibleSuggestion,
          "complementaryString":complementaryString
        });
      }
    });

    return filteredSuggestions;
  },

  subtextOfSuggestion: function(possibleSuggestion, partialWord){
    var transformedPossibleSuggestion = possibleSuggestion;
    var transformedPartialWord        = partialWord;

    this.caseSensitiveMatch = true;

    if(clientVars.ep_autocomp.caseSensitiveMatch === false){
      this.caseSensitiveMatch = false;
    }

    // check if it should be considered matches without matching case
    if (!this.caseSensitiveMatch){
      transformedPossibleSuggestion = transformedPossibleSuggestion.toLowerCase();
      transformedPartialWord        = transformedPartialWord.toLowerCase();
    }

    // compare words without ignoring Latin chars
    var isSubText = (transformedPossibleSuggestion.indexOf(transformedPartialWord) === 0);

    // if still doesn't match but should ignore Latin chars, try again ignoring them
    if (!isSubText && this.ignoreLatinCharacters) {
      transformedPossibleSuggestion = this.replaceLatinCharacters(transformedPossibleSuggestion);
      isSubText = (transformedPossibleSuggestion.indexOf(transformedPartialWord) === 0);
    }

    return isSubText;
  },

  /*
     Replace Latin characters with non-Latin equivalents.
     Currently replaces (both uppercase and lowercase):
       á, à, ä, ã, â,
       é, è, ë, ê,
       í, ì, ï, î,
       ó, ò, ö, õ, ô,
       ú, ù, ü, û,
       ç
   */
  replaceLatinCharacters: function(originalText) {
    return originalText.
      replace(/[àáäãâ]/g, "a").
      replace(/[ÀÁÄÃÂ]/g, "A").
      replace(/[èéëê]/g, "e").
      replace(/[ÈÉËÊ]/g, "E").
      replace(/[ìíïî]/g, "i").
      replace(/[ÌÍÏÎ]/g, "I").
      replace(/[òóöõô]/g, "o").
      replace(/[ÒÓÖÕÔ]/g, "O").
      replace(/[ùúüû]/g, "u").
      replace(/[ÙÚÜÛ]/g, "U").
      replace(/[ç]/g, "c").
      replace(/[Ç]/g, "C");
  },

  caretPosition:function(context){
    /*
    gets: context object from a ace editor event (e.g. aceEditEvent)
    returns: x and y value for the position of the caret measured in pixel.
    Should work in any other context too (if you need that functionality in another etherpad addon)

    useful to know:
    The structure inside the editor is usually:
    div
    |_ span
    |_ span
    |_ span

    div
    |- span
    etc.: Many divs (equal paragraphs) with spans inside (equal formated sections) So there are few spans if few formating
          took place, many spans if a lot of different bold, colored etc. text is there. But: the amount of nesting varies
          (one span may have a <b>, in which is a <i> etc. and instead of spans we may have code or the like as well.

    In this function, we will determine the div the caret is in and clone that div and its style. Than, in the clone, we find
    the corresponding subnode the caret is in, than the offset in the corresponding text node the caret is in.
    Than we insert a span exactly there and get its position.
    Than we clean up again, cause this is messy stuff.
    */
    var nodeInfo        = this.getNodeInfoWhereCaretIs(context);
    var counter         = nodeInfo.counter;
    var $childNode      = nodeInfo.node;
    var $cloneChildNode = this.cloneNodeWithStyle($childNode);

    //
    // In the following section we insert a DOM node where the caret is.
    //

    //how many characters are between the start of the element and the caret?
    var leftoverString = $cloneChildNode.text().length - (counter - context.rep.selEnd[1]);
    var targetNode = $cloneChildNode[0].childNodes[0]; // the subnode our caret is in.
    var targetNodeText = targetNode.nodeValue || ""; //get the text of the subnode our caret is in.

    var span = document.createElement("span"); //create a helper span to be inserted later
    span.appendChild(document.createTextNode('X'));//…and give it a content.

    var textBeforeCaret = targetNodeText.substr(0, leftoverString); //string before the caret
    var textAfterCaret = targetNodeText.substr(leftoverString); //string after the caret

    // Remove the existing text
    $cloneChildNode.text("");

    // reinsert the text, but with the additional node at caret position

    $cloneChildNode[0].appendChild(document.createTextNode(textBeforeCaret)); //insert text before caret
    $cloneChildNode[0].appendChild(span); //insert element at caret position.
    $cloneChildNode[0].appendChild(document.createTextNode(textAfterCaret)); //insert text after caret

    $cloneChildNode.appendTo($('iframe[name="ace_outer"]').contents().find('#outerdocbody')); //In order to see where the node we added that the caret position is, we need to insert it into the document. We do not append it in the inner editor (messes with ace), but put it in the outer one.

    var caretPosition = $(span).offset(); //now we get the position of the element which was inserted at the caret position
    var scrollYPos = $('iframe[name="ace_outer"]').contents().scrollTop(); //get scroll position to take it into account.

    $cloneChildNode.remove(); //clean up again.

    return {
      top: (caretPosition.top + scrollYPos), //so offset gives me the ofset to the root document (not the iframe) so after scrolling down, top becomes less or even negative. So add the offset to get back where it belongs.
      left:caretPosition.left
    };
  },

  getNodeInfoWhereCaretIs: function(context){
    var caretPosition = context.rep.selEnd; //get caret position as array, [0] is y, [1] is x;
    var caretColumn = caretPosition[1];
    var $caretDiv = $(context.rep.lines.atIndex(caretPosition[0]).domInfo.node); //determine the node the caret is in

    //$textNodes than holds all text nodes that are found inside the div (in the same order as in the document hopefully!)
    var $textNodes = $caretDiv.find("*").contents().filter(function() {
      return this.nodeType === 3;
    });

    //now we want to find the text node the caret is in.
    var counter = 0; //holds the added length of text of all text nodes parsed so far. Non parsed yet, so it's 0.
    var $childNode = null; //the subnode our caret is in.

    //find the child node the caret is in
    $textNodes.each(function(index,element){
      counter = counter + element.textContent.length; //add up to the length of text nodes parsed.
      //…current subnode. It can be put in the if clause as well, *but* if none is found that we would need to failsave this somewhere else
      $childNode = $(element.parentNode);

      //if the added text length of all text parsed is now  grater than the carets position.
      //using some plugins with neseted structures, it may be a bit off (to correct, substracting from selEnd[1] would be needed.
      if(counter >= caretColumn){
        return false; //stop .each by returning false
      }
    });

    if ($childNode === null) {
      // There was no text node inside $caretDiv, so caret is on an empty line.
      // Empty lines on Etherpad always have a <br>, so we get its parent.
      // We cannot use br itself because if we insert a span inside the br we
      // get weird positions on screen
      $childNode = $caretDiv.find("br").parent();
    }

    return {
      node: $childNode,
      counter: counter,
    };
  },

  // Clone $target node and copy its style
  cloneNodeWithStyle: function($targetNode){
    //Position of editor relative to client. Needed in final positioning
    //(maybe move this out for performance reasons? It rarely changes...)
    var $padOuter = $('iframe[name="ace_outer"]').contents().find('#outerdocbody');
    var $padInner = $padOuter.find('iframe[name="ace_inner"]');
    var innerEditorPosition = $padInner[0].getBoundingClientRect();

    //find the position of the target node
    var childNodePosition = $targetNode.position(); //was: offset()

    //get its styles (to reapply to a clone later)
    var computedCSS = window.getComputedStyle($targetNode[0]);

    //clone it
    var $clonedNode = $targetNode.clone();

    //apply all styles to it
    $clonedNode.attr("id","tempPosId");//change the id…
    $clonedNode.css({ //apply the styles (todo: do it for subnodes as well
      "position":"absolute",
      width:computedCSS.width,
      heigth:computedCSS.height,
      margin:computedCSS.margin,
      padding:computedCSS.padding,
      fontSize:computedCSS.fontSize,
      fontWeight:computedCSS.fontWeight,
      fontFamily:computedCSS.fontFamily,
      lineHeight:computedCSS.lineHeight,
      top:childNodePosition.top+innerEditorPosition.top+"px" , //old: position.top+innerEditorPosition.top+"px"
      left:childNodePosition.left+innerEditorPosition.left+"px", //old: position.left+innerEditorPosition.left+"px"
      background:"gray",
      color:"black",
      display:"block"
    });

    return $clonedNode;
  },

  getParam: function(sname){
  /*
  for getting URL parameters
  sname is the requested key
  returned is the keys value

  so if you have http://www.someurl.end?foo=bar
  it will return "bar" if you give it "foo"
  */
  var temp;
  var params = location.search.substr(location.search.indexOf("?")+1); //"?" devides the actual URL from the parameters
  var sval = "";
  params = params.split("&"); //"&" devides the kex/value pairs

  for (var i=0; i<params.length; i++)// split param and value into individual pieces
  {
  temp = params[i].split("=");
  if ( [temp[0]] == sname ) { sval = temp[1]; }
  }
  return sval;
  },

  isEditByMe:function(context){
    /*
    determines if the edit is done on the authors client or by a collaborator
    gets: context-objects
    returns: boolean. true (edit is done by author), false (edit done by someone else)
    */

    if (!context||!context.callstack) return false; //precaution

    if (context.callstack.editEvent.eventType !== "applyChangesToBase") {
      return true;
    } else {
      return false;
    }
  },
  getPossibleSuggestions:function(context){
    var hardcodedSuggestions =  clientVars.ep_autocomp.hardcodedSuggestions || [];
    var sourceSuggestions = [];
    if(clientVars.ep_autocomp.updateFromSourceObject){
      sourceSuggestions = eval(clientVars.ep_autocomp.updateFromSourceObject);
    }
    var regexToFind=eval(clientVars.ep_autocomp.regexToFind);

    var dynamicSuggestions=[];

    if(context && context.rep.alltext){
      /*
      NOTE:
      Here you can write code to fill the dynamicSuggestions array.
      The array must be a one-dimensional array containing only string values!
      */
      var allText = context.rep.alltext; //contains all the text from the document in a string.
      if(!clientVars.ep_autocomp.suggestWordsInDocument) allText = ""; // dont suggest words in document
      _.each(regexToFind,function(regEx){
        dynamicSuggestions = dynamicSuggestions.concat(allText.match(regEx)||[] );
      })
      // lines with lineAttributes start with '*', we need to remove them
      dynamicSuggestions = _.map(dynamicSuggestions, function(suggestion) {
        if (suggestion.substr(0,1) === "*") return suggestion.substr(1);
        return suggestion;
      });
    }//end if(context && context.rep.lines.allLines){
    return _.uniq(//uniq: prevent dublicate entrys
      hardcodedSuggestions.concat(dynamicSuggestions).concat(sourceSuggestions).sort(), //combine dynamic and static array, the resulting array is than sorted
    true);//true, since input array is already sorted
  },
  getCurrentPartialWord:function(context, customRegex, customRegexIndex){
    //TODO: make section marker dependend on the clientVars.ep_autocomp.regexToFind.
    //what is the  section to be considered? Usually, this will be everything which is not a space.
    //The Regex includes the $ (end of line) so we can find the section of interest beginning form the strings end.
    //(To understand better, just paste into regexpal.com)
    var sectionMarker = customRegex || /[\S]*$/;
    var index = customRegexIndex || 0;

    var caretColumnPosition = this.getCaretColumnOnline(context);
    var currentLine         = this.getCurrentLine(context);
    var textBeforeCaret     = currentLine.slice(0,caretColumnPosition); //from beginning until caret
    var regexMatches        = textBeforeCaret.match(sectionMarker);
    var partialWord         = regexMatches ? regexMatches[index] : "";
    return partialWord;
  },
  hasMarker:function(context, line){
    var attributeManager = context.documentAttributeManager;
    return (attributeManager.lineHasMarker(line));
  },
  getCurrentLine:function(context){
    var currentLine = context.rep.selEnd[0];
    var currentLineText = context.rep.lines.atIndex(currentLine).text;
    // if line has marker, it starts with "*". We need to ignore it
    var lineHasMarker = this.hasMarker(context, currentLine);
    if(lineHasMarker){
      currentLineText = currentLineText.substr(1);
    }
    return currentLineText;
  },
  getCaretColumnOnline:function(context){
    //TODO: must it be the same as selStart to be viable? FUD-test on equivalence?
    var currentColumn = context.rep.selEnd[1];
    var currentLine = context.rep.selEnd[0];
    // if line has marker, it starts with "*". We need to ignore it
    var lineHasMarker = this.hasMarker(context, currentLine);
    if(lineHasMarker){
      currentColumn--;
    }
    return currentColumn;
  }
};
