$(document).ready(function() {
    setReadOnlyFields(true);

    $("#submitBtn").click(function() {
        resetError();
        const input = getInput();

        if (isInputValid(input)) {
            try {
                const output = simulateCache(input);
                setOutput(output);
            } catch (error) {
                displayError(error);
            }
        } else {
            displayError("ERROR: Missing inputs");
        }
    });

    $("#resetBtn").click(function() {
        resetError();
        resetInput();
    });

    $("#downloadBtn").click(function() {
        downloadTxt();
    });

    function setReadOnlyFields(state) {
        const fields = ["hitCount", "missCount", "missDelay", "avgMemAccessTime", "totalMemAccessTime", "memorySnapshot", "generatedText"];
        fields.forEach(field => {
            document.getElementById(field).setAttribute('readonly', state);
        });
    }

    function downloadTxt() {
        const blob = new Blob([document.getElementById("generatedText").innerHTML], { type: "text/plain;charset=utf-8;" });
        saveAs(blob, "result.txt");
    }

    function getInput() {
        return {
            blockDimension: document.getElementById("blockDimension").value,
            numSets: document.getElementById("numSets").value,
            mainMemSize: document.getElementById("mainMemSize").value,
            mainMemUnit: document.getElementById("mainMemUnit").value,
            cacheSize: document.getElementById("cacheSize").value,
            cacheUnit: document.getElementById("cacheUnit").value,
            cacheCycle: document.getElementById("cacheCycle").value,
            memoryCycle: document.getElementById("memoryCycle").value,
            programSequence: document.getElementById("programSequence").value,
            programUnit: document.getElementById("programUnit").value
        };
    }

    function setOutput(output) {
        setReadOnlyFields(false);
        document.getElementById("hitCount").value = output.cacheHits;
        document.getElementById("missCount").value = output.cacheMisses;
        document.getElementById("missDelay").value = output.penaltyMiss;
        document.getElementById("avgMemAccessTime").value = output.avgAccessTime;
        document.getElementById("totalMemAccessTime").value = output.totalAccessTime;

        const snapshotTable = generateMemoryTable(output.memorySnapshot);
        document.getElementById("memorySnapshot").innerHTML = snapshotTable;

        document.getElementById("generatedText").innerHTML = `
            Cache hits: ${output.cacheHits}
            Cache misses: ${output.cacheMisses}
            Miss penalty: ${output.penaltyMiss}
            Average memory access time: ${output.avgAccessTime}
            Total memory access time: ${output.totalAccessTime}

            Cache memory snapshot:
            ${output.memorySnapshot}
        `;
        setReadOnlyFields(true);
    }

    function isInputValid(input) {
        return Object.values(input).every(value => value !== "");
    }

    function resetError() {
        document.getElementById("errorMessage").innerHTML = "";
    }

    function displayError(message) {
        document.getElementById("errorMessage").innerHTML = message;
    }

    function resetInput() {
        const fields = ["blockDimension", "numSets", "mainMemSize", "cacheSize", "cacheCycle", "memoryCycle", "programSequence"];
        fields.forEach(field => {
            document.getElementById(field).value = "";
        });
        document.getElementById("cacheCycle").value = 1;
        document.getElementById("memoryCycle").value = 10;
    }

    function simulateCache(input) {
        const blockSize = parseInt(input.blockDimension);
        const setSize = parseInt(input.numSets);
        const mmSize = parseInt(input.mainMemSize);
        const mmUnit = input.mainMemUnit;
        const cacheSize = parseInt(input.cacheSize);
        const cacheUnit = input.cacheUnit;
        const cacheCycleTime = parseInt(input.cacheCycle);
        const memCycleTime = parseInt(input.memoryCycle);
        const progFlow = input.programSequence.split(" ").map(Number);
        const progUnit = input.programUnit;

        const memSizeError = "ERROR: Program flow entry cannot exceed main memory size.";
        const flowError = "ERROR: Invalid program flow.";

        progFlow.forEach((entry) => {
            if (!Number.isInteger(entry)) {
                throw flowError;
            }
        });

        validateMemSize(mmSize, mmUnit, progFlow, progUnit, blockSize, memSizeError);

        let cacheSizeInBlocks = (cacheUnit === "words") ? cacheSize / blockSize : cacheSize;
        let numSets = cacheSizeInBlocks / setSize;

        let cacheMemory = Array.from({ length: numSets }, () => Array(setSize).fill(null));

        const convertedProgFlow = (progUnit === "words") ? progFlow.map(addr => Math.floor(addr / blockSize)) : progFlow;

        let cacheHits = 0;
        let cacheMisses = 0;

        convertedProgFlow.forEach((block, i) => {
            const setIndex = block % numSets;
            const hit = updateCacheMemory(cacheMemory, setIndex, block, i);

            if (hit) {
                cacheHits++;
            } else {
                cacheMisses++;
            }
        });

        const hitRate = cacheHits / (cacheHits + cacheMisses);
        const penaltyMiss = (2 * cacheCycleTime) + (blockSize * memCycleTime);
        const avgAccessTime = (hitRate * cacheCycleTime) + ((1 - hitRate) * penaltyMiss);
        const totalAccessTime = calculateTotalAccessTime(cacheHits, cacheMisses, cacheCycleTime, memCycleTime, blockSize);    
        const memorySnapshot = generateMemorySnapshot(cacheMemory);

        const output = {
            cacheHits: cacheHits,
            cacheMisses: cacheMisses,
            penaltyMiss: penaltyMiss,
            avgAccessTime: avgAccessTime,
            totalAccessTime: totalAccessTime,
            memorySnapshot: memorySnapshot
        };
    
        return output;
    }
    
    function validateMemSize(mmSize, mmUnit, progFlow, progUnit, blockSize, memSizeError) {
        if (mmUnit === "words") {
            validateProgFlowWords(mmSize, progFlow, progUnit, blockSize, memSizeError);
        } else {
            validateProgFlowBlocks(mmSize, progFlow, blockSize, memSizeError);
        }
    }
    
    function validateProgFlowWords(mmSize, progFlow, progUnit, blockSize, memSizeError) {
        if (progUnit === "words") {
            validateAddressRange(progFlow, mmSize - 1, memSizeError);
        } else {
            const mmSizeInBlocks = mmSize / blockSize;
            if (!Number.isInteger(mmSizeInBlocks)) {
                throw "ERROR: Main memory size (in words) and block size are not divisible.";
            }
            validateAddressRange(progFlow, mmSizeInBlocks - 1, memSizeError);
        }
    }
    
    function validateProgFlowBlocks(mmSize, progFlow, blockSize, memSizeError) {
        const memSizeInWords = mmSize * blockSize;
        validateAddressRange(progFlow, memSizeInWords - 1, memSizeError);
    }
    
    function validateAddressRange(addresses, maxAddress, memSizeError) {
        addresses.forEach(addr => {
            if (addr > maxAddress) {
                throw memSizeError;
            }
        });
    }
    
    function updateCacheMemory(cacheMemory, setIndex, block, timeStamp) {
        for (let j = 0; j < cacheMemory[setIndex].length; j++) {
            if (cacheMemory[setIndex][j] && cacheMemory[setIndex][j].address === block) {
                cacheMemory[setIndex][j].timeStamp = timeStamp;
                return true;
            }
        }
    
        const emptySlot = cacheMemory[setIndex].findIndex(slot => !slot);
        const maxTimeStampIndex = cacheMemory[setIndex].reduce((maxIndex, slot, index) => {
            if (!slot || (slot && slot.timeStamp > cacheMemory[setIndex][maxIndex].timeStamp)) {
                return index;
            }
            return maxIndex;
        }, 0);
    
        const replacementIndex = emptySlot !== -1 ? emptySlot : maxTimeStampIndex;
        cacheMemory[setIndex][replacementIndex] = { timeStamp, address: block };
    
        return false;
    }
    
    function calculateTotalAccessTime(cacheHits, cacheMisses, cacheCycleTime, memCycleTime, blockSize) {
        return (cacheHits * cacheCycleTime * blockSize) +
            (cacheMisses * (cacheCycleTime + memCycleTime) * blockSize) +
            (cacheMisses * cacheCycleTime);
    }
    
    function generateMemorySnapshot(cacheMemory) {
        let snapshot = "";
        cacheMemory.forEach((set, setIndex) => {
            set.forEach((block, blockIndex) => {
                const blockAddress = block ? block.address : "undefined";
                snapshot += `(Set ${setIndex}, Block ${blockIndex}) <= Block: ${blockAddress}\n`;
            });
        });
        return snapshot;
    }
    
    function generateMemoryTable(snapshot) {
        const rows = snapshot.split('\n').filter(row => row.trim() !== '');
        let table = '<table border="1"><tr><th>Set</th><th>Block</th><th>Block Address</th></tr>';
        rows.forEach(row => {
            const parts = row.match(/$begin:math:text$Set (\\d+), Block (\\d+)$end:math:text$ <= Block: (\w+)/);
            if (parts) {
                table += `<tr><td>${parts[1]}</td><td>${parts[2]}</td><td>${parts[3]}</td></tr>`;
            }
        });
        table += '</table>';
        return table;
    }
});