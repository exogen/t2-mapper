// #name = Data Struct - Map
// #version = 1.0.9
// #date = July 15, 2001
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Structure for fast lookup by key.
// #status = Release
// #include = support/list.cs
// #include = support/vector.cs

function Container::newListMap() {

    %x = new ScriptObject() {
        class = ListMap;
        superClass = Map;
        keys = Container::newList();
    };
    return %x;
}

function Container::newVectorMap() {

    %x = new ScriptObject() {
        class = VectorMap;
        superClass = Map;
        keys = Container::newVector();
    };
    return %x;
}

function ListMap::hasKey(%this, %key) {

	//return (%this.keys.findFirstIndex(%key) != -1);
	return (%this.keyLst[%key] !$= "");
}

function VectorMap::hasKey(%this, %key) {

	return (%this.keyMap[%key] !$= "");
}

// Expensive function.
// I could really use a for_each here, but I don't know if it's worth the overhead.
function ListMap::hasValue(%this, %value) {

	for(%node=%keys.head; %node !$= ""; %node=%node.next) {
		if (%this.keyLst[%node.value] $= %value) return true;
	}
	return false;
}
function VectorMap::hasValue(%this, %value) {

	%s = %keys.size();
	for(%i = 0; %i < %s; %i++) {
		if (%this.keyLst[%keys.valueAt(%i)] $= %value) return true;
	}
	return false;
}

function ListMap::add(%this, %key, %value) {

	%retVal = 0;
	if (%this.keyLst[%key] $= "") {
		%this.keyLst[%key] = %this.keys.pushBack(%key);
		%retVal = 1;
	}
	%this.keyMap[%key] = %value;
	return %retVal;
}

function VectorMap::add(%this, %key, %value) {

	%retVal = 0;
	if (%this.keyMap[%key] $= "") {
		%this.keys.pushBack(%key);
		%retVal = 1;
	}
	%this.keyMap[%key] = %value;
	return %retVal;
}

function ListMap::remove(%this, %key) {

	if (%this.keyLst[%key] !$= "") {
		%this.keys.removeAt(%this.keyLst[%key]);
		%this.keyList[%key] = "";
		%this.keyMap[%key] = "";
	}
}

function VectorMap::remove(%this, %key) {

	if (%this.hasKey(%key)) {
		%idx = %this.keys.findFirstIndex(%key);
		%this.keys.removeAt(%idx);
		%this.keyMap[%key] = "";
	}
}

function Map::clear(%this) {

	while (%this.keys.size()) {
		%this.remove(%this.keys.valueAt(0));
	}
}

function Map::delete(%this, %flag) {

	if (!%flag) {
		%this.keys.delete();
    	%this.schedule(1,delete,1);
    }
    else parent::delete(%this);
}

function Map::value(%this,%key) {

	return %this.keyMap[%key];
}

function Map::incrementValue(%this,%key) {

	return %this.keyMap[%key]++;
}

function Map::decrementValue(%this,%key) {

	return %this.keyMap[%key]--;
}

function Map::valueAt(%this,%index) {

	return %this.keyMap[%this.keys.valueAt(%index)];
}

function Map::size(%this) {

	return %this.keys.size();
}

function Map::keys(%this) {

	return %this.keys;
}