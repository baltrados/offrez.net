from typing import Annotated, TypedDict, Literal
import operator
from langchain_core.messages import HumanMessage, SystemMessage, BaseMessage, AIMessage
from langchain_openai import ChatOpenAI
from langchain_community.tools import ShellTool
from langchain_community.agent_toolkits import FileManagementToolkit
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.callbacks import StreamingStdOutCallbackHandler

# ==========================================
# 1. Configuration (Streaming LIVE)
# ==========================================
llm = ChatOpenAI(
    base_url="http://localhost:5001/v1",
    api_key="not-needed",
    model="local-model",
    temperature=0.1,
    streaming=True,
    callbacks=[StreamingStdOutCallbackHandler()]
)

# ==========================================
# 2. Les Outils
# ==========================================
shell_tool = ShellTool()
file_toolkit = FileManagementToolkit(root_dir=".") 
tools = [shell_tool] + file_toolkit.get_tools()
llm_with_tools = llm.bind_tools(tools)

# ==========================================
# 3. L'Équipe (Définition de l'État)
# ==========================================
class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    sender: str

# --- AGENT 1 : L'ARCHITECTE ---
def architect_node(state: State):
    print("\n\n" + "="*30 + " 🧠 ARCHITECTE " + "="*30)
    prompt = """Tu es l'Architecte Lead Dev. 
    1. Utilise 'read_file' pour lire 'deploy-to-server.md' IMMEDIATEMENT.
    2. Rédige un plan (Backup SSH, Modif locale, SCP/PM2).
    3. NE FAIS RIEN D'AUTRE. Ne modifie pas le code."""
    response = llm_with_tools.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "sender": "architect"}

# --- AGENT 2 : LE CODEUR ---
def coder_node(state: State):
    print("\n\n" + "="*30 + " 💻 CODEUR " + "="*30)
    prompt = """Tu es le Codeur DevOps. Exécute le plan de l'Architecte.
    Utilise 'terminal' pour SSH/SCP et les outils de fichiers pour le code.
    INTERDICTION : notepad, echo, vim."""
    response = llm_with_tools.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "sender": "coder"}

# --- AGENT 3 : LE CRITIC ---
def critic_node(state: State):
    print("\n\n" + "="*30 + " 🧐 CRITIC " + "="*30)
    prompt = """Tu es le QA Manager. Analyse le travail. 
    Si tout est déployé et correct, réponds UNIQUEMENT : APPROUVÉ.
    Sinon, explique pourquoi c'est REFUSÉ."""
    response = llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "sender": "critic"}

# ==========================================
# 4. Le Routeur (L'Aiguilleur)
# ==========================================
def router(state: State):
    last_msg = state["messages"][-1]
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "outils"
    
    sender = state.get("sender")
    if sender == "architect": return "coder"
    if sender == "coder": return "critic"
    if sender == "critic":
        if "APPROUVÉ" in last_msg.content.upper(): return END
        return "coder"

# ==========================================
# 5. Construction du Graph
# ==========================================
workflow = StateGraph(State)
workflow.add_node("architect", architect_node)
workflow.add_node("coder", coder_node)
workflow.add_node("critic", critic_node)
workflow.add_node("outils", ToolNode(tools))

workflow.add_edge(START, "architect")

workflow.add_conditional_edges("architect", router, ["outils", "coder"])
workflow.add_conditional_edges("coder", router, ["outils", "critic"])
workflow.add_conditional_edges("critic", router, ["coder", END])
workflow.add_conditional_edges("outils", lambda x: x["sender"], ["architect", "coder"])

graph = workflow.compile()

# ==========================================
# 6. LANCEMENT
# ==========================================
if __name__ == "__main__":
    tache = """Tu es l'Architecte Lead Dev. 
1. EXPLORE le projet pour localiser les fichiers de configuration et les manuels de déploiement.
2. Une fois les informations trouvées, rédige un plan (Backup SSH, Modif locale, SCP/PM2).
3. Ne modifie pas le code toi-même, délègue au Codeur."""
    print("\n🚀 DÉMARRAGE DE LA VRAIE ÉQUIPE MULTI-AGENT")
    graph.invoke({"messages": [HumanMessage(content=tache)]})