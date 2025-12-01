// #name = Date Support
// #version = 0.7.0
// #date = April 2, 2002
// #author = Andrew "Yogi" Weiland, Daryl "Stinkfist" Chance
// #warrior = Yogi, Stinkfist
// #email = yogi@tribalwar.com, stinkfist@teamwarfare.com
// #web = http://yogi.inquisition.nu
// #category = Support
// #description = A date API that requires no outside support
// #status = almost there!

// This script takes the results from getFileModify time
// and getFileCreateTime and makes them real usable.
// These functions return a 64 bit integer in the format: HIGH:LOW,
// which is the number of 100-nanosecond intervals  since Jan 1, 1601.
// Thanks to Tim Gift for answering my question on it
// Sound crazy?  Well, it's the standard NT time stamp format.
// to get this in a usable format, multiply by:
// (2^32/10^7)/8640 or 0.004971
// This will give you the number of days since Jan 1, 1601

// Usage:
// date(formatString, [epoch time]);
//    Returns a string formatted according to characters in the format string.
//    The format string recognizes the following characters:
//        d - Day of the month (w/ leading zero)
//        D - 3 letter day of the week (Fri)
//        F - Textual month, long (January)
//        j - Day of the month (no leading zero)
//        l - Day of the week, long (Friday)
//        L - 1 (one) if leap year, 0 (zero) if not
//        m - Month number (w/ leading zero)
//        M - Textual month, short (Jan)
//        n - Month number (no leading zero)
//        t - Number of days in given month
//        Y - Year (4 digits 2002)
//        y - Year (2 digits 02)
//        z - Day of the year
//        U - Days since epoch (in this case the epoch is Jan 1, 1601.
//               Note: this script will only generate dates AFTER Jan 1, 2001)
//
//    For example:
//        date("l m j, Y");
//        Will generate: Saturday Apr 6, 2002
//        date("m/d/y");
//        Will generate: 06/06/02
//
//    PHP enthusiasts will notice this is the exact same format that PHP's date()
//    function uses.
//
//    The optional parameter [epoch time] is the number of days since Jan 1, 1601
//    If you pass the function this parameter it will evaluate the format string
//    based on the date that the epoch time passed corresponds to.  Note that even
//    though you can pass any date to this function, it will only give you dates
//    AFTER Jan 1, 2001 (which is the first of the year that T2 was released).
//
// addDays(month, day, year, days)
//    Adds "days" number of days to the date (month, day, year) passed to the function.
//    It returns a date in epoch format that can be passed to date() for formatting.
//
// subtractDays(month, day, year, days)
//    Subtracts "days" number of days from the date (month, day, year) passed to the
//    function.  Note that "days" is a positive number.
// daysBetween(m1, d1, y1, m2, d2, y2)
//    Returns the number of days between 2 dates.
//
// convertEpoch(month, day, year)
//    Converts the date passed to the function to the epoch time
//
// The rest of the functions are dubbed "Use at your own risk"
// They are unsupported and are mainly support functions for the script
// but, are good functions none the less.
//



$T2EPOCH = 146096; // Jan, 1 2001 - first month of year that T2 was released...simplifies code.


// performs like PHP's date() function
function date(%format, %dateint) {

  if (%format $="") %format ="mdY";

  %dateint = (%dateint $= "") ? getCurrentDate() : %dateint;
  if (%dateint < $T2EPOCH) %dateint=getCurrentDate(); // Idiot proofing, no dates before Jan 1, 2001

  %days = %dateint - $T2EPOCH;

  %ly = isLeapYear(2001 + mfloor(%days / 365)) ? 366 : 365;
  for (%year = 2001; %days > %ly; %days -= %ly) {
      %year++;
      %ly = isLeapYear(%year) ? 366 : 365;
  }

  for (%months = 1; %months <= 12; %months++ ) {
    // are the leftover days greater then the current month? sub them
    // choose appropriate days in month too
    if (%days > daysPerMonth(%months, %year))
      %days -= daysPerMonth(%months, %year);
    else
      break;
  }
  return formatDate(%months, %days, %year, %format);
}


// Add %days number of days to m d y
// Returns time in epoch time
function addDays(%month, %day, %year, %days) {
         %d = convertEpoch(%month, %day, %year);
         %d += %days;
         return %d;
}

// Subtract %days number of days (passed as a POSITIVE number) from m d y
// Returns time in epoch time
function subtractDays(%month, %day, %year, %days) {
         return addDays(%month, %day, %year, -%days);
}

// # of days between dates
function daysBetween(%m1, %d1, %y1, %m2, %d2, %y2) {
         return abs(convertEpoch(%m2, %d2, %y2) - convertEpoch(%m1, %d1, %y1));
}

// Converts a m d y to the epoch time
function convertEpoch(%month, %day, %year) {
         %r = 0;
         for (%x=2001; %x < %year; %x++) %r += (isLeapYear(%x)) ? 366 : 365;
         for (%y=1; %y < %month; %y++) %r += daysPerMonth(%y, %year);
         %r += %day + $T2EPOCH;
         return %r;
}


////////////////////////////////////////////////////////////////////////////////
// "Private" functions
////////////////////////////////////////////////////////////////////////////////

// return # of days since Jan 1, 1601 to today
function getCurrentDate() {
         %filename = "omgihopethisnameisnttaken.unf";
         %outfile = new FileObject();
         %outfile.openForWrite(%filename);
         %outfile.writeLine("Colosus is my bitch");
         %outfile.close();
         %time = getFileCreateTime(%filename);
         //echo(%time);
         %date = convertTime(%time);
         %outfile.delete();
         deleteFile(%filename);

         return %date;
}

// Convert a high:low to days
function convertTime(%time) {
         %high = getSubStr(%time, 0, strpos(%time, ":"));
         %date = mfloor(0.004971 * %high);
         return %date;
}


function formatDate(%month, %day, %year, %format) {
  %q="";
  for (%x=0; %x < strlen(%format); %x++) {
      %f = getSubStr(%format, %x, 1);
      switch$(%f) {
                  case "D" :
                       if (strcmp("d", %f)==0) %q = %q @ ((%day < 10) ? "0" @ %day : %day);
                       else %q = %q @ getDayOfWeek(%month, %day, %year, 0);
                  case "F" :
                       %q = %q @ getMonth(%month, 1);
                  case "j" :
                       %q = %q @ %day;
                  case "L" :
                       if (strcmp("l", %f)==0) %q = %q @ getDayOfWeek(%month, %day, %year, 1);
                       else %q = %q @ isLeapYear(%year);
                  case "M" :
                       if (strcmp("m", %f) == 0) %q = %q @ ((%month < 10) ? "0" @ %month : %month);
                       else %q = %q @ getMonth(%month, 0);
                  case "n" :
                       %q = %q @ %month;
                  case "t" :
                       %q = %q @ daysPerMonth(%month, %year);
                  case "Y" :
                       if (strcmp("y", %f) == 0) %q = %q @ getSubStr(%year, 2, 2);
                       else %q = %q @ %year;
                  case "z" :
                       %d = 0;
                       for (%y=0; %y < %month; %y++) %d += daysPerMonth(%y, %year);
                       %q = %q @ (%d + %day);
                  case "U" :
                       %q = %q @ convertEpoch(%month, %day, %year);
                  default:
                       %q = %q @ %f;
      }
  }
  return %q;
}


// Find out how many days there are this month
// another one by stinky, BOOYA
function daysPerMonth(%month, %year) {
         %months[0] = "0 31 28 31 30 31 30 31 31 30 31 30 31";
         %months[1] = "0 31 29 31 30 31 30 31 31 30 31 30 31";
         return getWord(%months[isLeapYear(%year)], %month);
}

// one liner by stinky, BOOYA
function isLeapYear(%year) {
  return (%year % 4 == 0) && ((%year % 100 != 0) || (%year % 400 == 0));
}

// Get the month name.  Long==1 for long name
function getMonth(%month, %long) {
         %long = (%long $= "" || !%long) ? 0 : 1; // stick with this
         %months[0] = "0 Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec";
         %months[1] = "0 January February March April May June July August September October November December";
         return getWord(%months[%long], %month);
}

// Based on the doomsday algorithm
function getDayOfWeek(%month, %day, %year, %long) {
         %long = (%long $= "" || !%long) ? 0 : 1; // stick with this
         %days[0] = "Mon Tue Wed Thu Fri Sat Sun";
         %days[1] = "Monday Tuesday Wednesday Thursday Friday Saturday Sunday";
         %q = getDoomsDay(%month, %day, %year);
         return getWord(%days[%long], %q);
}

// omg, doomsday!!!
function getDoomsDay(%month, %day, %year) {
         %leapYear = isLeapYear(%year);
         %oddMonth = %month % 2;
         %doomsdayDayOfWeek = dayOfWeek(%year);
         if(%oddMonth==1) {
              if(%month==1) {
                  if(isLeapYear(%year)) %doomsdayOfMonth = 32;
                  else %doomsdayOfMonth = 31;
              }
   	          else if(%month==5) %doomsdayOfMonth = 9;
              else if(%month==7) %doomsdayOfMonth = 11;
              else if(%month==9) %doomsdayOfMonth = 5;
              else %doomsdayOfMonth = 7;
         }

         else {
              if(%month == 2) {
                        if(isLeapYear(%year)) %doomsdayOfMonth = 29;
                        else %doomsdayOfMonth = 28;
              }
              else %doomsdayOfMonth = %month;
         }

         if(%day < %doomsdayOfMonth) {
   	             %daysFromDoomsday = %doomsdayOfMonth - %day;
                 %offsetFromDoomsdayDayOfWeek = %daysFromDoomsday % 7;
                 if(%offsetFromDoomsdayDayOfWeek > %doomsdayDayOfWeek) return (%doomsdayDayOfWeek - %offsetFromDoomsdayDayOfWeek)+7;
                 else return %doomsdayDayOfWeek - %offsetFromDoomsdayDayOfWeek;
         }
         else {
              %daysFromDoomsday = %day - %doomsdayOfMonth;
              %offsetFromDoomsdayDayOfWeek = %daysFromDoomsday % 7;
              return (%doomsdayDayOfWeek + %offsetFromDoomsdayDayOfWeek) % 7;
         }
}

// omg more doomsday
function dayOfWeek(%year) {
   %day = 0;
   %yearCounter = 1898;

	if(%year < 1898) {
          while(%yearCounter!=%year) {
      	   if(isLeapYear(%yearCounter))
         	%day += 2;
         else
         	%day++;
         %yearCounter--;
      }
	return (7-(%day % 7));
   }
   else
   {
      while(%yearCounter!=%year)
      {
       	%yearCounter++;
			if(isLeapYear(%yearCounter))
         	%day += 2;
         else
         	%day++;

      }
   return %day % 7;
   }
}




