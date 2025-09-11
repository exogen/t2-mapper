#
# Tribes 2 Community System Reengineering Initiative
# Assymetric Cryptography Identity Provisioning
# Version 1.0
#
# Written by Electricutioner/Thyth
# http://absolous.no-ip.com/
# Copyright 2008
#
# Released under the terms of the GNU General Public License v3 or later.
# http://www.gnu.org/licenses/gpl.html
# Your use of this software is subject to the terms of that license. Use, modification, or distribution
# constitutes acceptance of these software terms. This license is the only manner by which you are permitted
# to use this software, thus rejection of the license terms prohibits your use of this software.
#

# fast modular exponentiation -- the key to the RSA algorithm
# result = (b ^ e) % m
def rsa_mod_exp(b, e, m)
	result = 1
	while (e > 0)
		if ((e & 1) == 1)
			result = (result * b) % m
		end
		e = e >> 1
		b = (b * b) % m
	end
	return result
end

# RSA key class to keep things nice and organized
class RSAKey
	# allow reading and writing the key values
	attr_reader :e, :n, :twister, :strength
	attr_writer :e, :d, :n, :twister

	# allow protecting the d value so it isn't stolen by evil scripts
	# once a key is protected, it cannot be deprotected, but it can be used to decrypt
	def protect
		@protected = 1
	end
	# attribute reader for d that returns nil if key protection is active
	def d
		if (@protected == 1)
			return nil
		else
			return @d
		end
	end

	# encrypt a message with the public exponent (e)
	# this could be construed as a misnomer, since this is used to verify authentication
	# images from the authentication server, and to verify a client has both parts of the key they
	# claim to have
	def encrypt(message)
		rsa_mod_exp(message, @e, @n)
	end

	# decrypt a message with the private exponent (d), also usable for signing
	# obviously, this will fail if the instance is only the public part of the key
	def decrypt(message)
		rsa_mod_exp(message, @d, @n)
	end

	# generate a new random RSA key of the specified bitsize
	# this generates keys that should be resistant to quick factorization techniques
	def generate(bitsize)
		p = 0
		q = 0
		@n = 100
		@strength = bitsize

		# test for some conditions that could produce insecure RSA keys
		# p, q difference to see if Fermat factorization could be successful
		#        p - q must be greater than 2*(n ^ (1/4))
		while ((p - q).abs < (2 * Math.sqrt(Math.sqrt(@n))))
			p = createPrime(bitsize / 2, 150)
			q = createPrime(bitsize / 2, 150)
			@n = p * q
		end

		totient = (p - 1) * (q - 1)

		# e must be coprime to the totient. we start at 3 and add 2 whenever coprime test fails
		@e = 3
		coprimee = 0
		while (coprimee)
			if (@e > 7)
				# e over 7 has a large chance of not being coprime to the totient
				generate(bitsize)
				return
			end
			block = extendedEuclid(@e, totient, 0, 1, 1, 0)
			if (block[0] > 1)
				@e = @e + 2
			else
				coprimee = nil
			end
		end
		
		# calculate the d value such that d * e = 1 mod totient
		# this calculation is done in the coprime of e verification
		@d = block[1]
		while (@d < 0)
			@d = @d + totient
		end

		# verify that the generated key is a valid RSA key
		1.upto(10) do |i|
			testVal = @twister.randomnumber(bitsize) % @n
			if (decrypt(encrypt(testVal)) != testVal)
				# key failed... generate a new one
				generate(bitsize)
				return
			end
		end
	end

	# private methods that people shouldn't be poking without a good reason
	private
		# obtain gcd and return the "d" value that we want
		def extendedEuclid(a, b, c, d, e, f)
			if (b == 0)
				block = Array.new(3, 0)
				block[0] = a; # gcd(a, b)
				block[1] = e; # coefficient of 'a' and the 'd' value we want
				block[2] = f; # coefficient of 'b'
				return block
			else
				return extendedEuclid(b, a % b, e - ((a / b) * c), f - ((a / b) * d), c, d);
			end
		end

		# create a prime number of the specified bitlength
		# the number of tests specified will control how many miller-rabin primality tests are run
		# this function will return a prime number with a high degree of confidence if sufficient
		# tests are run
		def createPrime(bitlen, tests)
			# generate a random number of the specific bitlen
			p = @twister.randomnumber(bitlen)

			# run the primality tests
			testrun = 0
			while (testrun < tests)
				if (prime?(p))
					testrun = testrun + 1
				else # not prime -- generate a new one
					return createPrime(bitlen, tests)
				end
			end
			return p
		end

		# run a miller-rabin primality test on the given number
		# returns true if the number is "probably" prime
		def prime?(potential)
			qandm = getqm(potential)
			if (qandm[0] == -1)
				return nil
			end

			bval = @twister.randomnumber(@strength / 2)
			mval = qandm[1]

			if (rsa_mod_exp(bval, mval, potential) == 1)
				return 1
			end
			j = 0
			while (j < qandm[0])
				if ((potential - 1) == rsa_mod_exp(bval, mval, potential))
					return 1
				end
				mval = mval * 2
				j = j + 1
			end
			return nil
		end

		def getqm(p)
			p = p - 1
			rt = Array.new(2, 0)
			if (p & 1 != 0)
				rt[0] = -1
				rt[1] = -1
				return rt
			end
			div = p / 2
			counter = 1
			while (div & 1 == 0)
				counter = counter + 1
				div = div / 2
			end
			rt[0] = counter
			rt[1] = div
			return rt
		end
end

# Mersenne Twister pseudo random number generator, modified for cryptographic security
# period length should be 20 * (2 ^ 19937 - 1)
class MersenneTwister
	@index = 0

	# build the internal storage array
	def initialize
		@mt = Array.new(624, 0)
	end

	# initialize the generator from a seed, can be done repeatedly
	def seedgen(seed)
		@mt[0] = seed
		1.upto(623) do |i|
			@mt[i] = 0xffffffff & (1812433243 * (@mt[i - 1] ^ (@mt[i - 1] >> 30)) + i)
		end
		generateNumbers
	end

	# extract a number that does not give away the state of the generator, takes 37 elements from generator
	# and applies SHA1 on it to get a 20 element number. this is repeated until the required length
	# is reached, and truncated as necessary to bring it down to the requested bitlen
	def randomnumber(bits)
		bytes = bits / 8
		if (bits % 8 != 0)
			bytes = bytes + 1
		end

		produced = 0
		output = 0
		stages = 0
		mask = 0

		sha1hash = SHA1Pure.new	
		while (produced < bytes)
			sha1hash.prepare
			1.upto(37) do |i|
				sha1hash.append(extractNumber().to_s);
			end
			digest = sha1hash.hexdigest.to_i(16)
			output = output | (digest << (160 * stages))
			produced = produced + 20
			stages = stages + 1
		end

		0.upto(bits.to_i) do |i|
			mask = (mask.to_i << 1) | 1
		end
		return (output & mask)
	end

	private
		# extract a tempered pseudorandom number
		def extractNumber()
			if (@index == 0)
				generateNumbers()
			end

			y = @mt[@index.to_i]
			y = y ^ (y >> 11)
			y = y ^ ((y << 7) & 2636928640)
			y = y ^ ((y << 15) & 4022730752)
			y = y ^ (y >> 18)
			y = y & 0xffffffff

			@index = (@index.to_i + 1) % 624
			return y
		end

		# generate 624 untempered numbers for this generator's array
		def generateNumbers()
			0.upto(623) do |i|
				y = (@mt[i] & 0x80000000) + (@mt[(i + 1) % 624] & 0x7FFFFFFF)
				@mt[i] = @mt[(i + 397) % 624] ^ (y >> 1)
				if (y & 1 == 1)
					@mt[i] = @mt[i] ^ 2567483615
				end
			end
		end
end

# SHA1 in Pure Ruby
class SHA1Pure

	def initialize
		prepare
	end

	# prepare the hash digester for a new hash
	def prepare
		@state = Array.new(5, 0)
		@block = Array.new(16, 0)
		@blockIndex = 0
		@count = 0

		@state[0] = 0x67452301
		@state[1] = 0xefcdab89
		@state[2] = 0x98badcfe
		@state[3] = 0x10325476
		@state[4] = 0xc3d2e1f0
	end

	# append a string to the string being digested
	def append(str)
		str = str.to_s
		str.each_byte {|c| update(c.to_i & 0xff)}
	end

	# produce a hexidecimal digest string
	def hexdigest
		bits = Array.new(8, 0)
		0.upto(7) do |i|
			bits[i] = (@count >> (((7 - i) * 8) & 0xff)) & 0xff
		end
		update(128)
		while (@blockIndex != 56)
			update(0)
		end
		0.upto(7) do |i|
			update(bits[i])
		end # this will accomplish a transform

		# output the digest
		digest = ""
		0.upto(4) do |i|
			chunk = @state[i].to_s(16)
			while(chunk.length < 8)
				chunk = "0" + chunk
			end
			digest = digest + chunk
		end
		prepare
		return digest
	end

	private
	def rol(val, bits)
		val = val.to_i
		bits = bits.to_i
		return (val << bits) | (val >> (32 - bits))
	end

	def blk0(i)
		i = i.to_i
		@block[i] = (rol(@block[i], 24) & 0xff00ff00) | (rol(@block[i], 8) & 0xff00ff)
		@block[i] = @block[i] & 0xffffffff
		return @block[i]
	end

	def blk(i)
		i = i.to_i
		@block[i & 15] = rol(@block[(i + 13) & 15] ^ @block[(i + 8) & 15] ^ @block[(i + 2) & 15] ^ @block[i & 15], 1)
		@block[i & 15] = @block[i & 15] & 0xffffffff
		return @block[i & 15]
	end

	def r0(data, v, w, x, y, z, i)
		data[z] += ((data[w] & (data[x] ^ data[y])) ^ data[y]) + blk0(i) + 0x5a827999 + rol(data[v], 5)
		data[z] = data[z] & 0xffffffff
		data[w] = rol(data[w], 30) & 0xffffffff
	end

	def r1(data, v, w, x, y, z, i)
		data[z] += ((data[w] & (data[x] ^ data[y])) ^ data[y]) + blk(i) + 0x5a827999 + rol(data[v], 5)
		data[z] = data[z] & 0xffffffff
		data[w] = rol(data[w], 30) & 0xffffffff
	end

	def r2(data, v, w, x, y, z, i)
		data[z] += (data[w] ^ data[x] ^ data[y]) + blk(i) + 0x6ed9eba1 + rol(data[v], 5)
		data[z] = data[z] & 0xffffffff
		data[w] = rol(data[w], 30) & 0xffffffff
	end

	def r3(data, v, w, x, y, z, i)
		data[z] += (((data[w] | data[x]) & data[y]) | (data[w] & data[x])) + blk(i) + 0x8f1bbcdc + rol(data[v], 5)
		data[z] = data[z] & 0xffffffff
		data[w] = rol(data[w], 30) & 0xffffffff
	end

	def r4(data, v, w, x, y, z, i)
		data[z] += (data[w] ^ data[x] ^ data[y]) + blk(i) + 0xca62c1d6 + rol(data[v], 5)
		data[z] = data[z] & 0xffffffff
		data[w] = rol(data[w], 30) & 0xffffffff
	end

	def transform
		dd = Array.new(5, 0)
		dd[0] = @state[0]
		dd[1] = @state[1]
		dd[2] = @state[2]
		dd[3] = @state[3]
		dd[4] = @state[4]

		r0(dd,0,1,2,3,4, 0)
		r0(dd,4,0,1,2,3, 1)
		r0(dd,3,4,0,1,2, 2)
		r0(dd,2,3,4,0,1, 3)
		r0(dd,1,2,3,4,0, 4)
		r0(dd,0,1,2,3,4, 5)
		r0(dd,4,0,1,2,3, 6)
		r0(dd,3,4,0,1,2, 7)
		r0(dd,2,3,4,0,1, 8)
		r0(dd,1,2,3,4,0, 9)
		r0(dd,0,1,2,3,4,10)
		r0(dd,4,0,1,2,3,11)
		r0(dd,3,4,0,1,2,12)
		r0(dd,2,3,4,0,1,13)
		r0(dd,1,2,3,4,0,14)
		r0(dd,0,1,2,3,4,15)
		r1(dd,4,0,1,2,3,16)
		r1(dd,3,4,0,1,2,17)
		r1(dd,2,3,4,0,1,18)
		r1(dd,1,2,3,4,0,19)
		r2(dd,0,1,2,3,4,20)
		r2(dd,4,0,1,2,3,21)
		r2(dd,3,4,0,1,2,22)
		r2(dd,2,3,4,0,1,23)
		r2(dd,1,2,3,4,0,24)
		r2(dd,0,1,2,3,4,25)
		r2(dd,4,0,1,2,3,26)
		r2(dd,3,4,0,1,2,27)
		r2(dd,2,3,4,0,1,28)
		r2(dd,1,2,3,4,0,29)
		r2(dd,0,1,2,3,4,30)
		r2(dd,4,0,1,2,3,31)
		r2(dd,3,4,0,1,2,32)
		r2(dd,2,3,4,0,1,33)
		r2(dd,1,2,3,4,0,34)
		r2(dd,0,1,2,3,4,35)
		r2(dd,4,0,1,2,3,36)
		r2(dd,3,4,0,1,2,37)
		r2(dd,2,3,4,0,1,38)
		r2(dd,1,2,3,4,0,39)
		r3(dd,0,1,2,3,4,40)
		r3(dd,4,0,1,2,3,41)
		r3(dd,3,4,0,1,2,42)
		r3(dd,2,3,4,0,1,43)
		r3(dd,1,2,3,4,0,44)
		r3(dd,0,1,2,3,4,45)
		r3(dd,4,0,1,2,3,46)
		r3(dd,3,4,0,1,2,47)
		r3(dd,2,3,4,0,1,48)
		r3(dd,1,2,3,4,0,49)
		r3(dd,0,1,2,3,4,50)
		r3(dd,4,0,1,2,3,51)
		r3(dd,3,4,0,1,2,52)
		r3(dd,2,3,4,0,1,53)
		r3(dd,1,2,3,4,0,54)
		r3(dd,0,1,2,3,4,55)
		r3(dd,4,0,1,2,3,56)
		r3(dd,3,4,0,1,2,57)
		r3(dd,2,3,4,0,1,58)
		r3(dd,1,2,3,4,0,59)
		r4(dd,0,1,2,3,4,60)
		r4(dd,4,0,1,2,3,61)
		r4(dd,3,4,0,1,2,62)
		r4(dd,2,3,4,0,1,63)
		r4(dd,1,2,3,4,0,64)
		r4(dd,0,1,2,3,4,65)
		r4(dd,4,0,1,2,3,66)
		r4(dd,3,4,0,1,2,67)
		r4(dd,2,3,4,0,1,68)
		r4(dd,1,2,3,4,0,69)
		r4(dd,0,1,2,3,4,70)
		r4(dd,4,0,1,2,3,71)
		r4(dd,3,4,0,1,2,72)
		r4(dd,2,3,4,0,1,73)
		r4(dd,1,2,3,4,0,74)
		r4(dd,0,1,2,3,4,75)
		r4(dd,4,0,1,2,3,76)
		r4(dd,3,4,0,1,2,77)
		r4(dd,2,3,4,0,1,78)
		r4(dd,1,2,3,4,0,79)

		@state[0] = (@state[0] + dd[0]) & 0xffffffff
		@state[1] = (@state[1] + dd[1]) & 0xffffffff
		@state[2] = (@state[2] + dd[2]) & 0xffffffff
		@state[3] = (@state[3] + dd[3]) & 0xffffffff
		@state[4] = (@state[4] + dd[4]) & 0xffffffff
	end

	def update(b)
		mask = (8 * (@blockIndex & 3))
		@count = @count + 8
		@block[@blockIndex >> 2] = @block[@blockIndex >> 2] & ~(0xff << mask)
		@block[@blockIndex >> 2] = @block[@blockIndex >> 2] | ((b & 0xff) << mask)
		@blockIndex = @blockIndex + 1
		if (@blockIndex == 64)
			transform
			@blockIndex = 0
		end
	end
end