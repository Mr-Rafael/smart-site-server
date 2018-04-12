
import serial
import time
import simplejson as json
import sys
ser = 0

# Inicializador de Serial
def init_serial():
    COMNUM = 11         #Enter Your COM Port Number Here.
    global ser          #Must be declared in Each Function
    ser = serial.Serial()
    ser.baudrate = 115200
    #ser.port = "COM{}".format(COMNUM)  #COM Port Name Start from 0

    ser.port = '/dev/ttyUSB0' #If Using Linux

    #Specify the TimeOut in seconds, so that SerialPort
    #Doesn't hangs
    ser.timeout = 10
    ser.open()          #Opens SerialPort

    # print port open or closed
    #if ser.isOpen():
    #    print 'Open: ' + ser.portstr


def main():
    bytes =  []
    command = "3109061A"
    ser.write(command.decode("hex"))
    contador= 0         #Writes to the SerialPort
    bytes.append(ser.readline())
    finalData = []
    twoBytesCounter = 0
    byteFormat = ""
    datos = [elem.encode("hex") for elem in bytes]
    #print datos
    for i in range(0, len(datos[0])):
        byteFormat = byteFormat+datos[0][i]
        twoBytesCounter = twoBytesCounter + 1
        if(twoBytesCounter == 2):
            finalData.append(byteFormat)
            twoBytesCounter = 0
            byteFormat = ""

    obj = [{'temperature': int(finalData[3],16)}, {'sonnar': int(finalData[4]+finalData[5], 16)}]
    print json.dumps(obj, separators=(',',':'), sort_keys=True)
    sys.stdout.flush()

if __name__ == "__main__":
    init_serial()
    main()
