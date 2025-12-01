// #name = Data Struct - Circular Queue
// #version = 1.0.0
// #date = January 2, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Handy buffer data structure.
// #category = Support
// #status = Release

// It breaks ::delete() to have the class have a constructor function
// in it's own namespace.  So I put it in another one...

function Container::newCircularQueue(%size) {

    if (%size == 0) return "";

    %x = new ScriptObject() {
        class = CircularQueue;
        front = 0;
        back = 0;
        count = 0;
        size = %size;
    };
    return %x;
}

function CircularQueue::clear(%this) {

	for (%i = 0; %i < %this.size; %i++) {
		%this.array[%i] = "";
	}
	%this.front = %this.back = %this.count = 0;
}

function CircularQueue::pushBack(%this, %value) {

	%overflow = false;

	%tmp = %this.back;

	%this.back++;
	%this.back %= %this.size;

	if (%tmp == %this.front && (%this.count != 0)) {
		%this.front++;
		%this.front %= %this.size;
		%overflow = true;
		%this.lastOverFlow = %this.array[%tmp];
	}
	else %this.count++;

	%this.array[%tmp] = %value;

	return %overflow;
}

function CircularQueue::popFront(%this) {

	%retVal = "";

	if (%this.count == 0) return "";
	else {
		%retVal = %this.array[%this.front];
		%this.front++;
		%this.front %= %this.size;
		%this.count--;
	}

	return %retVal;
}

function CircularQueue::size(%this) {

	return %this.size;
}

function CircularQueue::count(%this) {

	return %this.count;
}

function CircularQueue::isFull(%this) {

	return (%this.count == %this.size);
}

function CirularQueue::getLastOverFlow(%this) {

	return %this.lastOverFlow;
}