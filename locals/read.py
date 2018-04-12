# This script will recive the port to read and return a read measure.

import serial
import sys

#Get the pin to read.
pinNumber = sys.argv[1]

#Make the read
print ("Reading port: " + str(pinNumber))
