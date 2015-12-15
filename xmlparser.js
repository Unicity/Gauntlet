//I'm rolling my own SNITCHES!!!
var tokens = {
  unknown: 0,
  greaterThan: 1,
  lessThan: 2,
  forwardSlash: 3,
  equals: 4,      
  colon: 5,
  questionMark: 6,
  identifier: 7,
  closeTage: 8,
  string: 9,
  endOfStream: 10
}

function createNode(key, type, value, line){
  return {
    key: key,
    type: type,
    value: value,
    line: line,
    children: []
  }
}

function isAlpha(character){
  var code = character.charCodeAt(0);
  var isUpperCase = (code > 64 && code < 91);
  var isLowerCase = (code > 96 && code < 123);
  if(isUpperCase || isLowerCase){
    return true;
  }
  else{
    return false;
  }
}

function isWhitespace(character){
  var result = ((character == ' ') ||
                 (character == '\t') ||
                 (character == '\v') ||
                 (character == '\f'));
  return result;
}

function eatAllWhitespace(tokenizer){
  var character 
  while(1){
    character = tokenizer.text.charAt(tokenizer.index);
    if(isWhitespace(character)){
      tokenizer.index++;
    } 
    else if(isEndOfLine(character)){
      tokenizer.index++;
      tokenizer.lineNumber++;
    }
    else{
      break;
    }
  }
}

function isEndOfLine(character){
  var result = ((character == '\n') ||
                 (character == '\r'));

  return(result);
}

function requireToken(tokenizer, type){
  var token = getToken(tokenizer);
  while(token.type !== tokens.endOfStream && token.type !== type){
    token = getToken(tokenizer);
  }
  return token;
}

function getToken(tokenizer, peek){
  var token = {
    text: "",
  }

  var oldIndex = tokenizer.index;
  eatAllWhitespace(tokenizer);
  var character = tokenizer.text.charAt(tokenizer.index);
  tokenizer.index++;
  switch(character){  

    case '>': {token.type = tokens.greaterThan; break;}
    case '<': {
      if(tokenizer.text.charAt(tokenizer.index) === "/"){
        token.text = tokenizer.text.substring(oldIndex, tokenizer.index)
        requireToken(tokenizer, tokens.greaterThan);
        token.type = tokens.closeTag;
      }
      else{
        token.type = tokens.lessThan;
      }
    }break;
    case '/': {token.type = tokens.forwardSlash; break;}
    case '=': {token.type = tokens.equals; break;}
    case ':': {token.type = tokens.colon; break;}
    case "?": {token.type = tokens.questionMark; break;}
    case '"': {
      //Get the text from a string
      var textStart = tokenizer.index;
      token.type = tokens.string;
      while(tokenizer.text.charAt(tokenizer.index) && tokenizer.text.charAt(tokenizer.index) != '"'){
        if(tokenizer.text.charAt(tokenizer.index) === "\\" && tokenizer.text.charAt(tokenizer.index+1)){
          tokenizer.index++;
        }
        tokenizer.index++;
      }
      if(tokenizer.text.charAt(tokenizer.index) === '"'){
        token.text = tokenizer.text.substring(textStart, tokenizer.index);
        tokenizer.index++;
      }   
    }break;
    default:{
      if(isAlpha(character) || character === "_"){
        character = tokenizer.text.charAt(tokenizer.index);
        var identifierStart = tokenizer.index - 1;
        while(!isWhitespace(character) && character !== "=" && character !== ">" && character !== "<"){
          tokenizer.index++;
          character = tokenizer.text.charAt(tokenizer.index);
        }
        token.text = tokenizer.text.substring(identifierStart, tokenizer.index);
        token.type = tokens.identifier;
      }
      else if(!character){
        token.type = tokens.endOfStream;
        
      }
      else{
        token.type = tokens.unknown;
      }
      
    }break;
  }
  if(peek){
    tokenizer.index = oldIndex;
  }
  return token;
}

function ASTToJSON (ast, lineNumbers){
  var Result = {};
  if (ast.type === "object") {
    ast.children.forEach(function(child){

      Result[child.key] = ASTToJSONWithLineNumbers(child);
    });
  }
  else if (ast.type === "array"){
    Result = [];
    ast.children.forEach(function(child){
      Result[child.key] = ASTToJSONWithLineNumbers(child);
    })
  } 
  else{
    Result = ast.value;
  }
  return Result;
}

function XMLToAST (tokenizer) {
  
  var tokensKeys = Object.keys(tokens);
  var parsing = true;
  var node = createNode();

  var token;
  while(parsing){
    token = getToken(tokenizer);
    switch(token.type){

      case tokens.lessThan :{
        //Ignore the header
        var tagName = getToken(tokenizer);
        if(tagName.type === tokens.questionMark){
          while(getToken(tokenizer).type !== tokens.greaterThan){
          }
        }else{
          node.key = tagName.text;
          node.type = "object"
        }
      }break;

      case tokens.identifier: {
        requireToken(tokenizer, tokens.equals);
        var value = getToken(tokenizer);
        node.children.push({
          type:"text",
          key:token.text,
          value: value.text
        });
      }break;

      case tokens.greaterThan: {
        //Check if we have child nodes or not
        if(getToken(tokenizer, true).type !== tokens.lessThan){
          //If the next token isn't a new tag then it is our value.
          var start = tokenizer.index;
          var end = start;
          var value;

          while(getToken(tokenizer).type !== tokens.closeTag){
            end = tokenizer.index;
          }
          value = tokenizer.text.substring(start, end);

          node.type = "text";
          node.value = value;
          return node;
        }
        else{
          while(getToken(tokenizer, true).type !== tokens.closeTag && getToken(tokenizer, true).type !== tokens.endOfStream){
            node.children.push(XMLToAST(tokenizer));
          }
        }
      }break;

      case tokens.closeTag: {
        return node;
      }break;

      //Self closing tags
      case tokens.forwardSlash: {
        requireToken(tokenizer, tokens.greaterThan);
        return node;
      }break;
      case tokens.unknown: {
        
        
        //return node;
      }break;

      case tokens.endOfStream: {

        parsing = false;
      }break;

      default: {
        
      }
    }
  }
  return node;
}

function parse(xmlString){
  var tokenizer = {
    text: xmlString,
    lineNumber: 0,
    index: 0
  }
  var Result = JSON.stringify(XMLToAST(tokenizer), null, 2);
  return Result;
}

module.exports.parse = parse;
module.exports.test = function(){
  var TestXML = 
  '<?xml version="1.0" encoding="UTF-8"?>\
  <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://api.exigo.com/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\
      <SOAP-ENV:Header>\
          <ns1:ApiAuthentication id="ref1">\
              <ns1:Company>{{Company}}</ns1:Company>\
              <ns1:LoginName>{{LoginName}}</ns1:LoginName>\
              <ns1:Password>{{Password}}</ns1:Password>\
          </ns1:ApiAuthentication>\
          <ns1:ApiAuthentication href="#ref1"/>\
      </SOAP-ENV:Header>\
      <SOAP-ENV:Body>\
          <ns1:TransactionalRequest>\
              <ns1:TransactionRequests>\
                  <ns1:ApiRequest xsi:type="ns1:CreateOrderRequest">\
                      <ns1:CustomerID>36554001</ns1:CustomerID>\
                      <ns1:OrderStatus>Pending</ns1:OrderStatus>\
                      <ns1:OrderDate>2015-10-28T14:15:52-06:00</ns1:OrderDate>\
                      <ns1:CurrencyCode>USD</ns1:CurrencyCode>\
                      <ns1:WarehouseID>{{WarehouseID}}</ns1:WarehouseID>\
                      <ns1:ShipMethodID>{{ShipMethodID}}</ns1:ShipMethodID>\
                      <ns1:PriceType>1</ns1:PriceType>\
                      <ns1:FirstName>First</ns1:FirstName>\
                      <ns1:LastName>Last</ns1:LastName>\
                      <ns1:Address1>965 S</ns1:Address1>\
                      <ns1:City>Orem</ns1:City>\
                      <ns1:State>UT</ns1:State>\
                      <ns1:Zip>84058</ns1:Zip>\
                      <ns1:Country>US</ns1:Country>\
                      <ns1:Phone>555-555-5555</ns1:Phone>\
                      <ns1:OrderType>{{OrderType}}</ns1:OrderType>\
                      <ns1:TaxRateOverride xsi:nil="true"/>\
                      <ns1:ShippingAmountOverride xsi:nil="true"/>\
                      <ns1:UseManualOrderID xsi:nil="true"/>\
                      <ns1:ManualOrderID xsi:nil="true"/>\
                      <ns1:TransferVolumeToID xsi:nil="true"/>\
                      <ns1:ReturnOrderID xsi:nil="true"/>\
                      <ns1:OverwriteExistingOrder>false</ns1:OverwriteExistingOrder>\
                      <ns1:ExistingOrderID>0</ns1:ExistingOrderID>\
                      <ns1:PartyID xsi:nil="true"/>\
                      <ns1:Details>\
                          <ns1:OrderDetailRequest>\
                              <ns1:ItemCode>25161</ns1:ItemCode>\
                              <ns1:Quantity>1</ns1:Quantity>\
                              <ns1:ParentItemCode xsi:nil="true"/>\
                              <ns1:PriceEachOverride xsi:nil="true"/>\
                              <ns1:TaxableEachOverride xsi:nil="true"/>\
                              <ns1:ShippingPriceEachOverride xsi:nil="true"/>\
                              <ns1:BusinessVolumeEachOverride xsi:nil="true"/>\
                              <ns1:CommissionableVolumeEachOverride xsi:nil="true"/>\
                              <ns1:Other1EachOverride xsi:nil="true"/>\
                              <ns1:Other2EachOverride xsi:nil="true"/>\
                              <ns1:Other3EachOverride xsi:nil="true"/>\
                              <ns1:Other4EachOverride xsi:nil="true"/>\
                              <ns1:Other5EachOverride xsi:nil="true"/>\
                              <ns1:Other6EachOverride xsi:nil="true"/>\
                              <ns1:Other7EachOverride xsi:nil="true"/>\
                              <ns1:Other8EachOverride xsi:nil="true"/>\
                              <ns1:Other9EachOverride xsi:nil="true"/>\
                              <ns1:Other10EachOverride xsi:nil="true"/>\
                              <ns1:DescriptionOverride xsi:nil="true"/>\
                              <ns1:Reference1 xsi:nil="true"/>\
                          </ns1:OrderDetailRequest>\
                      </ns1:Details>\
                  </ns1:ApiRequest>\
                  <ns1:ApiRequest xsi:type="ns1:ChargeCreditCardTokenOnFileRequest">\
                      <ns1:CreditCardAccountType>Primary</ns1:CreditCardAccountType>\
                      <ns1:OrderID>0</ns1:OrderID>\
                      <ns1:MaxAmount xsi:nil="true"/>\
                      <ns1:MerchantWarehouseIDOverride xsi:nil="true"/>\
                  </ns1:ApiRequest>\
              </ns1:TransactionRequests>\
          </ns1:TransactionalRequest>\
          <param1>true</param1>\
          <param2>true</param2>\
      </SOAP-ENV:Body>\
  </SOAP-ENV:Envelope>'
  parse(TestXML);
};