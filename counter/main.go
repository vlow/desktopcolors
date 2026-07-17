package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: counter <serve|dump> [flags]")
		os.Exit(2)
	}
	fmt.Fprintf(os.Stderr, "counter: subcommand %q not wired yet\n", os.Args[1])
	os.Exit(2)
}
