// https://gist.github.com/TooTallNate/1785026

//
// A quick little thingy that takes a Stream instance and makes
// it emit 'line' events when a newline is encountered.
//   *
//   Usage:
//   ‾‾‾‾‾
//  emitLines(process.stdin)
//  process.stdin.resume()
//  process.stdin.setEncoding('utf8')
//  process.stdin.on('line', function (line) {
//    console.log(line event:', line)
//  })
//

export default function emitLines(stream: NodeJS.ReadableStream) {
    let backlog = '';

    stream.on('data', function (data: string) {
        backlog += data;

        let n = backlog.indexOf('\n');

        // got a \n? emit one or more 'line' events
        return (() => {
            let result = [];
            while (~n) {
                stream.emit('line', backlog.substring(0, n));
                backlog = backlog.substring(n + 1);
                result.push(n = backlog.indexOf('\n'));
            }
            return result;
        })();
    });

    return stream.on('end', function () {
        if (backlog) { return stream.emit('line', backlog); }
    });
};
