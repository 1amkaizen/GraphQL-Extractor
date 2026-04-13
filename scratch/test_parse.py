import re

def parse_body(body_text):
    # Dummy parser test
    # In reality, this requires tracking curly braces
    tokens = re.findall(r'\{|\}|\w+|\.\.\.', body_text)
    
    # We can walk the tokens to build a tree
    root = {"name": "Root", "fields": {}}
    stack = [root]
    
    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token == '{':
            # The previous token was an object field
            pass
        elif token == '}':
            stack.pop()
        elif token == '...':
            # Fragment spread
            pass
        else:
            # Field or something
            # Check if next token is '{'
            if i + 1 < len(tokens) and tokens[i+1] == '{':
                new_obj = {"name": token, "fields": {}}
                stack[-1]["fields"][token] = {"type": "object", "ref": new_obj}
                stack.append(new_obj)
            else:
                stack[-1]["fields"][token] = {"type": "scalar"}
        i += 1
    return root

body = """
    id label status lastUpdateTime
    repository { name id url vendor }
    triggeredBy {
      ... on User { id name avatarUrl email }
      ... on VCSUser { avatarUrl vendor name id login }
    }
    triggerMethod commitSHA deploymentUrl environmentUrl
"""

print(parse_body(body))
