
# How to sort code ?

The following can be used to sort code: 
```tsx
let codes: String[] = ...;
codes = sortCode(
    codes, 
    scalaDistance,
    makeScalaPreprocessor([ "globalVar1", "localVar2" ])
)
```

The array in the scala preprocessor reprensents bound variables with known names. Other variables will be
automatically rewritten to generic names so two students using different variable names with the same
code structure will generate the same token sequence.
